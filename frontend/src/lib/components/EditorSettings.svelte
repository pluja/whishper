<script>
    import { editorSettings } from '$lib/stores';
</script>

<div class="flex flex-row items-center justify-center p-3 space-x-4 m-2">
    <div
        class="form-control tooltip"
        data-tip="When clicking a timestamp input, seek the video to that position."
    >
        <label class="label cursor-pointer space-x-2">
            <span class="label-text">Seek on click</span>
            <input bind:checked={$editorSettings.seekOnClick} type="checkbox" class="checkbox checkbox-sm" />
        </label>
    </div>

    <div class="form-control tooltip" data-tip="Automatically save changes every 30s.">
        <label class="label cursor-pointer space-x-2">
            <span class="label-text">Autosave</span>
            <input bind:checked={$editorSettings.autoSave} type="checkbox" class="checkbox checkbox-sm" />
        </label>
    </div>
</div>