import { writable } from 'svelte/store';

// contains all transcriptions
export const transcriptions = writable([]);

// contains the current editing transcription
export const currentTranscription = writable();

// transcription to be downloaded
export const downloadTranscription = writable(null);

// Editor history

export const editorHistory = writable([]);

// Upload progress and status
export const uploadProgress = writable(0);

// editor settings
export let editorSettings = writable({
    autosave: false,
    autosaveInterval: 30000,
    autosaveNotify: true,
    seekOnClick: true,
});

// Video player settings
export const currentVideoPlayerTime = writable(0);