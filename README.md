[cloudflare-deploy-url]: https://deploy.workers.cloudflare.com/?url=https://github.com/typicalninja/r2-screenshot-worker
[cloudflare-docs-secret-variable]: https://developers.cloudflare.com/workers/configuration/secrets/
[cloudflare-docs-secret-variable-deployed]: https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers

# r2-screenshot-worker

A Cloudflare Worker that captures screenshots of webpages and stores them in a Cloudflare R2 bucket for fast, persistent access.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)][cloudflare-deploy-url]

## Getting Started

You can deploy this project using the Cloudflare dashboard or the Wrangler CLI.

### Deploy with Cloudflare Dashboard

1. Click the **Deploy to Cloudflare Workers** button above.
2. Create an R2 bucket named `website-screenshot-bucket` (or any name you prefer — just make sure to update it in the environment variables).
3. Click **Create and Deploy** to deploy the worker.
4. Set the required environment variables in the Cloudflare Dashboard under **Settings > Variables & Secrets**. See the [Configuration](#configuration) section below for details.

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
> You can use a different name — just remember to update it in wrangler.jsonc.

#### 3. Set additional environment variables

Follow the [Configuration](#configuration) section below to set the required variables.

#### 4. Deploy the worker

```bash
npx wrangler deploy
```

#### 5. Add SECRET_KEY as a [secret variable][cloudflare-docs-secret-variable]

```bash
npx wrangler secret put SECRET_KEY
```

> `SECRET_KEY` should be a secure, random string used to sign requests. Use a password manager or generator to create a strong value.

> **you may need to re-deploy for the key to be included in the environment.**

### Configuration

You can configure variables either in wrangler.jsonc or through the Cloudflare Dashboard.

#### Secret Variables

- `SECRET_KEY` - Used to sign and validate requests. Keep this key secure.

> You need to deploy the worker before you can set secret variables in the Cloudflare dashboard.
> [Learn how to add secrets to deployed workers.][cloudflare-docs-secret-variable-deployed].

#### Configuration Variables

- `CORS_ORIGIN` - CORS origin to allow; default is `*` (allows all origins)
- `BROWSER_USER_AGENT` - User agent string used by the browser
- `R2_BUCKET_PREFIX` - Prefix for R2 object names; default is `website-screenshot`. Do not include a trailing slash.

## Example Request

To capture a screenshot, send a `GET` request to the `/` endpoint with the following query parameters:

- `site`: **(Required)** The URL of the page to capture.
- `fullPage`: *(Optional)* Set to `true` to capture the full scrollable page.
- `width`: *(Optional)* Viewport width in pixels (default: `1280`).
- `height`: *(Optional)* Viewport height in pixels (default: `800`).
- `expireAt`: **(Required)** Expiration timestamp in milliseconds (UNIX epoch).
- `sig`: **(Required)** HMAC signature to validate the request.


> **Note:** \`expireAt\` is only used during signature verification.  
> If a screenshot already exists in R2, it will be returned even if the timestamp is expired.

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
    // The objectName within R2
    // To retrieve the image use GET <r2 url>/<objectName>
    // Prefix is set in wrangler.jsonc as R2_BUCKET_PREFIX
    "objectName": "{prefix}/something*****",
    "created": false // false = served from cache, true = newly created
}
```


## License

This repository and the code inside it is licensed under the Apache-2.0 License. Read [LICENSE](./LICENSE) for more information.

---

Want to support the project? [Star it on GitHub ★](https://github.com/typicalninja/r2-screenshot-worker/stargazers)