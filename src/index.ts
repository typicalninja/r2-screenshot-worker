import puppeteer from '@cloudflare/puppeteer';
import { verifySignature, stringTo256Hash } from './crypto-utils';

const DEFAULT_HEADERS = {
	'Content-Type': 'application/json',
	'Cache-Control': 'public, max-age=3600',
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

function respondWithJson(data: Record<string, unknown>, status = 200, corsOrigin: string = '*'): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			...DEFAULT_HEADERS,
			'Access-Control-Allow-Origin': corsOrigin,
		},
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			// Handle preflight requests
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
					'Access-Control-Allow-Methods': 'GET, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
		}

		// only GET requests are allowed
		if (request.method !== 'GET') {
			return respondWithJson({ error: 'Unsupported method.' }, 405);
		}

		const { searchParams } = new URL(request.url);
		let rawSiteUrl = searchParams.get('site');

		if (!rawSiteUrl) {
			return respondWithJson({ error: 'site parameter is required' }, 400);
		}

		const siteUrlHash = await stringTo256Hash(rawSiteUrl);
		const r2BucketPrefix = env.R2_BUCKET_PREFIX || 'website-screenshot';
		const objectName = `${r2BucketPrefix}/${siteUrlHash}.webp`;

		// check if the file already exists in R2
		const existingFile = await env.R2_STORE_BUCKET.head(objectName);
		if (existingFile) {
			return respondWithJson(
				{
					objectName,
					created: false,
				},
				200,
				env.CORS_ORIGIN
			);
		}

		// get the env values from the environment
		const secret = env.SECRET_KEY;

		// secret is required for signing requests
		if (!secret) {
			return respondWithJson(
				{
					error: 'Configuration error, `SECRET_KEY` environment variable unavailable.',
				},
				500,
				env.CORS_ORIGIN
			);
		}

		// used for tamper detection
		const signature = searchParams.get('sig');
		const expireAt = searchParams.get('expireAt');

		if (!signature || !expireAt) {
			return respondWithJson(
				{
					error: '`sig` and `expireAt` parameters are required (?sig=[]&expireAt=[timestamp])',
				},
				400,
				env.CORS_ORIGIN
			);
		}

		const expireAtTimestamp = Number(expireAt);
		// if expireAt is not provided, is not a valid number or is in the past,
		// error out with a 400 Bad Request response
		if (!Number.isSafeInteger(expireAtTimestamp) || expireAtTimestamp <= Date.now()) {
			return respondWithJson(
				{
					error: 'Invalid or expired "expireAt" parameter.',
				},
				400,
				env.CORS_ORIGIN
			);
		}

		searchParams.delete('sig');

		const signatureData = searchParams.toString();
		const isValidSignature = await verifySignature(signatureData, signature, secret);
		if (!isValidSignature) {
			return respondWithJson(
				{
					error: 'Invalid signature.',
				},
				403,
				env.CORS_ORIGIN
			);
		}

		const fullPage = searchParams.get('fullPage') === 'true';
		const width = parseInt(searchParams.get('width') || '1280', 10);
		const height = parseInt(searchParams.get('height') || '800', 10);

		if (isNaN(width) || isNaN(height)) {
			return respondWithJson(
				{
					error: 'Invalid width or height parameters.',
				},
				400,
				env.CORS_ORIGIN
			);
		}

		const siteUrl = new URL(rawSiteUrl);

		const browser = await puppeteer.launch(env.BROWSER);
		const page = await browser.newPage();

		if (env.BROWSER_USER_AGENT) {
			await page.setUserAgent(env.BROWSER_USER_AGENT);
		}

		await page.setViewport({
			width,
			height,
		});

		await page.goto(siteUrl.toString());

		const screenshot = await page.screenshot({
			// best for web resources
			type: 'webp',
			fullPage,
		});

		await browser.close();
		await env.R2_STORE_BUCKET.put(objectName, screenshot);

		return respondWithJson(
			{
				objectName,
				created: true,
			},
			200,
			env.CORS_ORIGIN
		);
	},
} satisfies ExportedHandler<Env>;
