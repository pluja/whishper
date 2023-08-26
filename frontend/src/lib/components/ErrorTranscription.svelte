<script>
    import {deleteTranscription} from "$lib/utils.js";
    export let tr;
</script>


<div class="alert alert-error p-3">
    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    <span>
        <p class="font-bold text-info-content text-md">id-{tr.id}</p>
        <p class="font-mono text-info-content text-sm opacity-70">Failed: Could not transcribe.</p>
    </span>
    <div>
        <button on:click={deleteTranscription(tr.id)} class="btn btn-sm">Delete</button>
    </div>
</div>