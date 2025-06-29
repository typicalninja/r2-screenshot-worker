[cloudflare-deploy-url]: https://deploy.workers.cloudflare.com/?url=https://github.com/typicalninja/r2-screenshot-worker

# r2-screenshot-worker

A Cloudflare Worker that captures screenshots of webpages and stores them in a Cloudflare R2 bucket for fast, persistent access.

[![Deploy to cloudflare workers](https://deploy.workers.cloudflare.com/button)][cloudflare-deploy-url]

## Getting Started

You can deploy this worker using the Cloudflare dashboard or the Wrangler CLI. **The easiest way is to click the button above.**

#### Deploy with Cloudflare Dashboard

1. Click the "Deploy to Cloudflare Workers" button above.
2. Create an R2 bucket named `website-screenshot-bucket` (or any name you prefer, but update it in the environment variables).
3. Make sure you follow the [Configuring Environment Variables](#configuration) section below to set the required environment variables in `wrangler.jsonc`.
4. Click "Save and Deploy" to deploy the worker.

#### Deploy with Wrangler CLI

1. Clone the repository:

```bash
git clone https://github.com/typicalninja/r2-screenshot-worker.git

cd r2-screenshot-worker
```

2. Create the R2 bucket:


```bash
npx wrangler r2 bucket create website-screenshot-bucket
```
> You may choose a different name, but make sure to update it in `wrangler.jsonc`

3. Set environment variables

Make sure you follow the [Configuring Environment Variables](#configuration) section below to set the required environment variables in `wrangler.jsonc`.


4. Deploy the worker

```bash
npx wrangler deploy
```

### Configuration

You can configure the worker by modifying the `wrangler.jsonc` file. The following environment variables can be changed either in the `wrangler.jsonc` file or through the Cloudflare dashboard:

- `SECRET_KEY` - Secret used to verify requests
- `CORS_ORIGIN` - CORS origin to allow; default is * (allows all origins)
- `BROWSER_USER_AGENT` - User agent string used by the browser
- `R2_BUCKET_PREFIX` - Prefix for R2 object names; default is `website-screenshot/`

## Example Request

To capture a screenshot, send a `GET` request to the `/` endpoint with the following query parameters:

- `url`: (Required) URL to capture
- `expireAt`: 	(Required) Expiration timestamp in milliseconds (UNIX epoch)
- `sig`: 	(Required) HMAC signature for request validation
- `fullPage`: (Optional) Set to true to capture the entire scrollable page

> Note: expireAt only applies during signature validation. If the screenshot already exists in R2, it is returned regardless of expiration.

### Signing requests

To prevent tampering, requests must be signed using HMAC (SHA-256) with your secret key (`SECRET_KEY`).


```js
import crypto from 'crypto';

const SECRET = 'your_secret_key_here';
const site = 'https://example.com';
const fullPage = false;
const expireAt = Date.now() + 60_000;

const params = new URLSearchParams({
  site,
  expireAt: expireAt.toString(),
  ...(fullPage ? { fullPage: 'true' } : {}),
});

const dataToSign = params.toString();
const sig = crypto.createHmac('sha256', SECRET)
  .update(dataToSign)
  .digest('base64')
  // Convert base64 to URL-safe base64
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

params.set('sig', sig);

const signedUrl = `https://your-worker-url.workers.dev/?${params.toString()}`;
console.log('Signed URL:', signedUrl);
```

### Response format

```jsonc
{
    // the objectName within r2
    // to retrieve the image use GET <r2 url>/<objectName>
    // prefix is set in wrangler.jsonc as R2_BUCKET_PREFIX
    "objectName:" "{prefix}/something*****",
    "created": false, // false = served from cache, true = newly created
}
```

### How it works

When the request is received, the worker will:
1. check for the `site` parameter in the query string.
2. convert the `site` parameter to a object name by sha256 hashing it and appending the `.webp` extension.
3. check if the screenshot already exists in the R2 bucket.
4. If it exists, it will return the existing screenshot.
5. If it does not exist, proceed to validate the request signature using the `sig` and `expireAt` parameters.
6. If the signature is valid, it will use Puppeteer to launch a headless browser, navigate to the specified URL, and take a screenshot. If `fullPage` is set to `true`, it will capture the entire page; otherwise, it will capture only the viewport.
6. The screenshot will be stored in the R2 bucket with the object name.
7. Finally, it will return a JSON response with the object name and a success status.

## License

This repository and the code inside it is licensed under the Apache-2.0 License. Read [LICENSE](./LICENSE) for more information.

---

Want to support the project? [Star it on GitHub ★](https://github.com/typicalninja/r2-screenshot-worker/stargazers)