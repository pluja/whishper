<!-- SuccessTranscription.svelte -->
<script>
    import {createEventDispatcher} from 'svelte';
    import {deleteTranscription} from "$lib/utils.js";
    export let tr;

    const dispatch = createEventDispatcher();
    let download = () => {
        dispatch('download', tr); // emit a custom event with the transcription as detail
    }
    let translate = () => {
        dispatch('translate', tr); // emit a custom event with the transcription as detail
    }
</script>

<div class="alert alert-success p-3">
    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    <span>
        <p class="font-bold text-info-content text-md">{tr.fileName.split("_WHSHPR_")[1]}</p>
        <p class="font-mono text-info-content text-sm opacity-60 flex space-x-2 md:space-x-4 lg:space-x-8">
            <span class="space-x-1">
                <span class="font-bold text-xs">{new Date(Math.round(tr.result.duration) * 1000).toISOString().substr(11, 8)} long</span>
            </span>
            <span class="space-x-1">
                <span class="font-bold text-xs">{tr.translations.length} translations</span>
            </span>
            <span class="space-x-1">
                <span class="font-bold text-xs">{tr.result.text.split(" ").length} words</span>
            </span>
        </p>
    </span>
    <div class="flex items-center justify-center flex-wrap space-x-2">
        <a href="/editor/{tr.id}" class="btn btn-xs md:btn-sm">
            <span class="tooltip flex items-center justify-center" data-tip="Edit">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M12 15l8.385 -8.415a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3z"></path>
                    <path d="M16 5l3 3"></path>
                    <path d="M9 7.07a7 7 0 0 0 1 13.93a7 7 0 0 0 6.929 -6"></path>
                 </svg>
            </span>
        </a>
        <button  on:click={download} onclick="modalDownloadOptions.showModal()" class="btn btn-xs md:btn-sm">
            <span class="tooltip flex items-center justify-center" data-tip="Download">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"></path>
                    <path d="M7 11l5 5l5 -5"></path>
                    <path d="M12 4l0 12"></path>
                 </svg>
            </span>
        </button>
        <button on:click={translate} class="btn btn-xs md:btn-sm btn-primary">
            <span class="tooltip flex items-center justify-center" data-tip="Translate">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M4 5h7"></path>
                    <path d="M7 4c0 4.846 0 7 .5 8"></path>
                    <path d="M10 8.5c0 2.286 -2 4.5 -3.5 4.5s-2.5 -1.135 -2.5 -2c0 -2 1 -3 3 -3s5 .57 5 2.857c0 1.524 -.667 2.571 -2 3.143"></path>
                    <path d="M12 20l4 -9l4 9"></path>
                    <path d="M19.1 18h-6.2"></path>
                </svg>
            </span>
        </button>
        <button on:click={deleteTranscription(tr.id)} class="btn btn-xs md:btn-sm btn-error">
            <span class="tooltip flex items-center justify-center" data-tip="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M20 6a1 1 0 0 1 .117 1.993l-.117 .007h-.081l-.919 11a3 3 0 0 1 -2.824 2.995l-.176 .005h-8c-1.598 0 -2.904 -1.249 -2.992 -2.75l-.005 -.167l-.923 -11.083h-.08a1 1 0 0 1 -.117 -1.993l.117 -.007h16zm-9.489 5.14a1 1 0 0 0 -1.218 1.567l1.292 1.293l-1.292 1.293l-.083 .094a1 1 0 0 0 1.497 1.32l1.293 -1.292l1.293 1.292l.094 .083a1 1 0 0 0 1.32 -1.497l-1.292 -1.293l1.292 -1.293l.083 -.094a1 1 0 0 0 -1.497 -1.32l-1.293 1.292l-1.293 -1.292l-.094 -.083z" stroke-width="0" fill="currentColor"></path>
                    <path d="M14 2a2 2 0 0 1 2 2a1 1 0 0 1 -1.993 .117l-.007 -.117h-4l-.007 .117a1 1 0 0 1 -1.993 -.117a2 2 0 0 1 1.85 -1.995l.15 -.005h4z" stroke-width="0" fill="currentColor"></path>
                </svg>
            </span>
        </button>
    </div>
</div>