import { transcriptions } from '$lib/stores';
import { browser, dev } from '$app/environment';
import { PUBLIC_INTERNAL_API_HOST } from '$env/static/public';
import { CLIENT_API_HOST } from '$lib/utils';

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
    // Use different endpoints for server-side and client-side
    const endpoint = browser ? `${CLIENT_API_HOST}/api/transcriptions` : `${PUBLIC_INTERNAL_API_HOST}/api/transcriptions`;
    console.log(endpoint);

    const response = await fetch(endpoint);
    const ts = await response.json();

    if (ts) {
        transcriptions.update(_ => ts.length > 0 ? ts : []);
    } else {
        transcriptions.update(_ => []);
    }    
}