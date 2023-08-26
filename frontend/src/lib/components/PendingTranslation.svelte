<script>
    export let tr;
</script>

<div class="alert alert-info p-3">
    <span class="loading loading-dots loading-md"></span>
    <span>
        <p class="font-bold text-info-content text-md flex items-center justify-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-language-hiragana" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                <path d="M4 5h7"></path>
                <path d="M7 4c0 4.846 0 7 .5 8"></path>
                <path d="M10 8.5c0 2.286 -2 4.5 -3.5 4.5s-2.5 -1.135 -2.5 -2c0 -2 1 -3 3 -3s5 .57 5 2.857c0 1.524 -.667 2.571 -2 3.143"></path>
                <path d="M12 20l4 -9l4 9"></path>
                <path d="M19.1 18h-6.2"></path>
            </svg>
            <span>{tr.fileName != "" ? tr.fileName.split("_WHSHPR_")[1] : tr.id}</span>
        </p>
        <p class="opacity-60">
            <span class="font-mono text-info-content text-sm ">
                Waiting for translation...
            </span>
        </p>
    </span>
</div>