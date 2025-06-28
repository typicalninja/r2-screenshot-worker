function base64urlDecode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=');
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export async function verifySignature(
    // the data we want to verify
    data: string,
    // the signature to verify against
    signature: string,
    // the decryption key used to sign the data
    decryptionKey: string,
) {
    const decodedSignature = base64urlDecode(signature);
    const encoder = new TextEncoder();
    const key = encoder.encode(decryptionKey);
    const dataBuffer = encoder.encode(data);

    const keyBuffer = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
    );

    return await crypto.subtle.verify(
        'HMAC',
        keyBuffer,
        decodedSignature,
        dataBuffer,
    );
}