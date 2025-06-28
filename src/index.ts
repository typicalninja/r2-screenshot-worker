import puppeteer from '@cloudflare/puppeteer';
import { verifySignature } from './tamper-detection';

// file names are hashed using SHA-256
async function toFileName(site: string): Promise<string> {
	const fileName = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(site));
	return Array.from(new Uint8Array(fileName))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

const CONTENT_TYPE_JSON = 'application/json';
const CACHE_CONTROL = 'public, max-age=3600';
const DEFAULT_CORS = '*';

function respondWithJson(data: Record<string, unknown>, status = 200, corsOrigin: string = DEFAULT_CORS): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': CONTENT_TYPE_JSON,
			'Cache-Control': CACHE_CONTROL,
			'Access-Control-Allow-Origin': corsOrigin,
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
		},
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		// validate request method
		if (request.method !== 'GET') {
			return respondWithJson(
				{
					error: 'Unsupported method.',
				},
				405,
				env.CORS_ORIGIN
			);
		}

		const { searchParams } = new URL(request.url);
		// UrlEncoded site URL
		let rawSiteUrl = searchParams.get('site');

		if (!rawSiteUrl) {
			return respondWithJson({ error: '"site" parameter is required (?site=<>)' }, 400);
		}

		const fileNameHex = await toFileName(rawSiteUrl);
		const objectName = `screenshots/${fileNameHex}.webp`;

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

		const fullPage = searchParams.get('fullPage') === 'true';
		// used for tamper detection
		const signature = searchParams.get('sig');
		const expireAt = searchParams.get('expireAt');

		// get the env values from the environment
		const secret = env.SECRET_KEY;

		// if secret key is provided, all requests must be signed
		if (secret) {
			if (!signature || !expireAt) {
				return respondWithJson({
					error: "`sig` and `expireAt` parameters are required (?sig=<>&expireAt=<timestamp>)",
				}, 400, env.CORS_ORIGIN);
			}

			// check if the timestamp is valid
			const expireAtTimestamp = parseInt(expireAt, 10);
			if (isNaN(expireAtTimestamp) || expireAtTimestamp < Date.now()) {
				return respondWithJson({
					error: 'Invalid or expired timestamp in "expireAt" parameter.',
				}, 400, env.CORS_ORIGIN);
			}

			// verify the signature
			const searchParamsCopy = new URLSearchParams(searchParams);
			// remove the signature parameter from the search params
			searchParamsCopy.delete('sig');
			// decode the rawSiteUrl to ensure it is in the correct format
			searchParamsCopy.set('site', decodeURIComponent(rawSiteUrl));

			const signatureData = searchParamsCopy.toString();
			const isValidSignature = await verifySignature(signatureData, signature, secret);
			if (!isValidSignature) {
				return respondWithJson({
					error: 'Invalid signature.',
				}, 403, env.CORS_ORIGIN);
			}
		}

		const siteUrl = new URL(rawSiteUrl);

		const browser = await puppeteer.launch(env.BROWSER);
		const page = await browser.newPage();

		if (env.BROWSER_USER_AGENT) {
			await page.setUserAgent(env.BROWSER_USER_AGENT);
		}

		await page.goto(siteUrl.toString());

		const screenshot = await page.screenshot({
			// best for web resources
			type: 'webp',
		});

		await browser.close();
		await env.R2_STORE_BUCKET.put(objectName, screenshot);

		return respondWithJson({
			objectName,
			created: true,
		}, 200, env.CORS_ORIGIN);
	},
} satisfies ExportedHandler<Env>;
