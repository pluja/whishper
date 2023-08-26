<script>
    export let tr;
</script>

<div class="alert alert-info p-3">
    <span class="loading loading-ring loading-md"></span>
    <span>
        <p class="font-bold text-info-content text-md">{tr.fileName != "" ? tr.fileName.split("_WHSHPR_")[1] : tr.id}</p>
        <p class="font-mono text-info-content text-sm opacity-60">Waiting for transcription...</p>
    </span>
</div>