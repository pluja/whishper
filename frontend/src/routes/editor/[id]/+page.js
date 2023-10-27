/** @type {import('./$types').PageLoad} */
import { currentTranscription } from '$lib/stores';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

export async function load({params}) {
    // Fetch json from /api/transcriptions/{id}
    let id = params.id;
    // Use different endpoints for server-side and client-side
    const endpoint = browser ? `${env.PUBLIC_API_HOST}/api/transcriptions` : `${env.PUBLIC_INTERNAL_API_HOST}/api/transcriptions`;
    const response = await fetch(`${endpoint}/${id}`);
    const ts = await response.json();
    // Set currentTranscription to the fetched transcription
    currentTranscription.set(ts);
};