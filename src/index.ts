import puppeteer from '@cloudflare/puppeteer';
import { verifySignature } from './tamper-detection';

// file names are hashed using SHA-256
async function toFileName(site: string): Promise<string> {
	const fileName = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(site));
	return Array.from(new Uint8Array(fileName))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function createResponse(objectName: string, created: boolean, corsOrigin: string = '*'): Response {
	return new Response(
		JSON.stringify({
			// r2 object name
			objectName,
			// wether r2 already has the image for this url
			created,
		}),
		{
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=3600',
				'Access-Control-Allow-Origin': corsOrigin,
				'Access-Control-Allow-Methods': 'GET, OPTIONS',
			},
		}
	);
}

export default {
	async fetch(request, env): Promise<Response> {
		const { searchParams } = new URL(request.url);
		let site = searchParams.get('site');
		const fullPage = searchParams.get('fullPage') === 'true';
		// used for tamper detection
		const signature = searchParams.get('sig');
		const expireAt = searchParams.get('expireAt');

		if (!site) {
			return new Response("Site is a require parameter", { status: 400 });
		}

		const fileNameHex = await toFileName(site);
		// object name = r2 object key
		const objectName = `screenshots/${fileNameHex}.webp`;

		// check if the file already exists in R2
		const existingFile = await env.R2_STORE_BUCKET.head(objectName);
		if (existingFile) {
			return createResponse(objectName, false, env.CORS_ORIGIN);
		}

		// get the env values from the environment
		const secret = env.SECRET_KEY;

		// if secret key is provided, all requests must be signed
		if (secret) {
			if (!signature || !expireAt) {
				return new Response("signature and expireAt parameters are required", { status: 400 });
			}

			// check if the timestamp is valid
			const expireAtTimestamp = parseInt(expireAt, 10);
			if (isNaN(expireAtTimestamp) || expireAtTimestamp < Date.now()) {
				return new Response("expireAt parameter is invalid or expired", { status: 400 });
			}
			// verify the signature
			const searchParamsCopy = new URLSearchParams(searchParams);
			// remove the signature parameter from the search params
			searchParamsCopy.delete('sig');
			searchParamsCopy.set('site', decodeURIComponent(site));

			const signatureData = searchParamsCopy.toString();
			const isValidSignature = await verifySignature(signatureData, signature, secret);
			if (!isValidSignature) {
				return new Response("Invalid signature", { status: 403 });
			}
		}

		const siteUrl = new URL(site);

		const browser = await puppeteer.launch(env.BROWSER);
		const page = await browser.newPage();

		if(env.BROWSER_USER_AGENT) {
			await page.setUserAgent(env.BROWSER_USER_AGENT);
		}

		await page.goto(siteUrl.toString());

		const screenshot = await page.screenshot({
			// best for web resources
			type: 'webp',
			optimizeForSpeed: true,
		});

		await browser.close();
		await env.R2_STORE_BUCKET.put(objectName, screenshot);

		return createResponse(objectName, true, env.CORS_ORIGIN)
	},
} satisfies ExportedHandler<Env>;
