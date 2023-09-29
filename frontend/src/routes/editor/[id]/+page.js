/** @type {import('./$types').PageLoad} */
import { currentTranscription } from '$lib/stores';
import { CLIENT_API_HOST } from '$lib/utils';
import { browser } from '$app/environment';

export async function load({params}) {
    // Fetch json from /api/transcriptions/{id}
    let id = params.id;
    // Use different endpoints for server-side and client-side

    const endpoint = browser ? `${CLIENT_API_HOST}/api/transcriptions` : `${process.env.INTERNAL_API_HOST}/api/transcriptions`;
    const response = await fetch(`${endpoint}/${id}`);
    const ts = await response.json();
    // Set currentTranscription to the fetched transcription
    currentTranscription.set(ts);
};