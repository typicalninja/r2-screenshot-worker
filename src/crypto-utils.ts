function base64urlDecode(str: string): Uint8Array {
	const base64 = str
		.replace(/-/g, '+')
		.replace(/_/g, '/')
		.padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function verifySignature(
	// the data we want to verify
	data: string,
	// the signature to verify against
	signature: string,
	// the secret key used to sign the data
	secretKey: string
) {
	const decodedSignature = base64urlDecode(signature);
	const encoder = new TextEncoder();
	const key = encoder.encode(secretKey);
	const dataBuffer = encoder.encode(data);

	const keyBuffer = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);

	return await crypto.subtle.verify('HMAC', keyBuffer, decodedSignature, dataBuffer);
}

/**
 * Convert a string to a SHA-256 hash string
 * @param str 
 * @returns 
 */
export async function stringTo256Hash(str: string): Promise<string> {
	const fileName = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
	return Array.from(new Uint8Array(fileName))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
