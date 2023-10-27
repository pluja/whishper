import { transcriptions } from '$lib/stores';
import { browser, dev } from '$app/environment';
import { env } from '$env/dynamic/public';

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
    // Use different endpoints for server-side and client-side
    const endpoint = browser ? `${env.PUBLIC_API_HOST}/api/transcriptions` : `${env.PUBLIC_INTERNAL_API_HOST}/api/transcriptions`;

    const response = await fetch(endpoint);
    const ts = await response.json();

    if (ts) {
        transcriptions.update(_ => ts.length > 0 ? ts : []);
    } else {
        transcriptions.update(_ => []);
    }    
}