[cloudflare-deploy-url]: https://deploy.workers.cloudflare.com/?url=https://github.com/typicalninja/r2-screenshot-worker

# r2-screenshot-worker

A Cloudflare Worker that captures screenshots of webpages and stores them in a Cloudflare R2 bucket for fast, persistent access.

[![Deploy to cloudflare workers](https://deploy.workers.cloudflare.com/button)][cloudflare-deploy-url]

## Getting Started

You can deploy this project using the Cloudflare dashboard or the Wrangler CLI.

### Deploy with Cloudflare Dashboard

1. Click the "Deploy to Cloudflare Workers" button above.
2. Create an R2 bucket named `website-screenshot-bucket` (or any name you prefer, but update it in the environment variables).
3. Click "Create and Deploy" to deploy the worker.
4. Make sure you follow the [Configuration](#configuration) section below to set the required environment variables. (you can do this in the Cloudflare dashboard under "Settings" > "Variables & Secrets")

### Deploy with Wrangler CLI

#### 1. Clone the repository:

```bash
git clone https://github.com/typicalninja/r2-screenshot-worker.git

cd r2-screenshot-worker
```

#### 2. Create the R2 bucket:


```bash
npx wrangler r2 bucket create website-screenshot-bucket
```
> You may choose a different name, but make sure to update it in `wrangler.jsonc`

#### 3. Set environment variables

Make sure you follow the [Configuration](#configuration) section below to set the required environment variables.


#### 4. Deploy the worker

```bash
npx wrangler deploy
```

### Configuration

The following configuration variables can be changed either in the `wrangler.jsonc` file or through the Cloudflare dashboard:

- `SECRET_KEY` - Secret used to verify requests. You should not set this in the `wrangler.jsonc` file directly. Instead, use the Cloudflare dashboard to set it as a secret variable. **This key is used to sign requests and should be kept secret.** (you can set it after deploying the worker)
- `CORS_ORIGIN` - CORS origin to allow; default is * (allows all origins)
- `BROWSER_USER_AGENT` - User agent string used by the browser
- `R2_BUCKET_PREFIX` - Prefix for R2 object names; default is `website-screenshot`. do not include a trailing slash.

## Example Request

To capture a screenshot, send a `GET` request to the `/` endpoint with the following query parameters:

- `url`: (Required) URL to capture
- `fullPage`: (Optional) Set to true to capture the entire scrollable page
- `width`: (Optional) Width of the viewport in pixels (default is 1280)
- `height`: (Optional) Height of the viewport in pixels (default is 800)
- `expireAt`: 	(Required) Expiration timestamp in milliseconds (UNIX epoch)
- `sig`: 	(Required) HMAC signature for request validation


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


## License

This repository and the code inside it is licensed under the Apache-2.0 License. Read [LICENSE](./LICENSE) for more information.

---

Want to support the project? [Star it on GitHub ★](https://github.com/typicalninja/r2-screenshot-worker/stargazers)