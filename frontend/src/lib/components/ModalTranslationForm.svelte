<script>
    import { onMount } from 'svelte';
    import toast from 'svelte-french-toast';
    import { CLIENT_API_HOST } from '$lib/utils';
    import { PUBLIC_TRANSLATION_API_HOST } from '$env/static/public';
    export let tr;

    let targetLanguage = null;

    let availableLanguages = [];
    const getAvailableLangs = () => {
        const fetchLanguages = () => {
            fetch(`${PUBLIC_TRANSLATION_API_HOST}/languages`)
            .then(res => res.json())
            .then(data => {
                if (data) {
                    availableLanguages = data;
                    console.log(availableLanguages)
                    // Languages fetched successfully, stop trying
                    clearInterval(fetchLanguagesInterval);
                }
            });
        };

        // Fetch languages repeatedly until successful
        const fetchLanguagesInterval = setInterval(fetchLanguages, 5000);
        fetchLanguages();
    };

    const handleTranslate = (id) => {
        if(targetLanguage) {
            const url = `${CLIENT_API_HOST}/api/translate/${id}/${targetLanguage}`;
            fetch(url)
            .then(() => toast.success('Translation started!'))
            .catch(error => {
                console.error(error);
                toast.error('Error translating text!')
            });
        }
    }


    onMount(async () => {
        await getAvailableLangs();
    });
</script>

<dialog id="modalTranslation" class="modal">
    <form method="dialog" class="modal-box flex flex-col items-center justify-center">
        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
        {#if tr}
            <h1 class="text-center font-bold mt-2 pb-2">
                Translate
            </h1>
            <div>
                <!-- Language picker -->
                <div class="form-control w-full max-w-xs">
                    <label for="target-lan" class="label">
                      <span class="label-text">Target language</span>
                    </label>
                    <select bind:value={targetLanguage} name="target-lan" class="select select-bordered">
                      <option disabled selected>Pick one</option>
                      <!-- Iterate all available languages -->
                      {#each availableLanguages as lan}
                        <!-- When we find the source language -->
                        {#if lan.code == tr.result.language}
                            <!-- Iterate all possible target languages -->
                            {#each lan.targets as t}
                                {#if t != tr.result.language}
                                    <option value="{t}">{t}</option>
                                {/if}
                            {/each}
                        {/if}
                      {/each}
                    </select>
                </div>
                <!-- End language picker-->
                <button on:click={handleTranslate(tr.id)} class="btn btn-active btn-primary mt-5">Translate</button>
            </div>
        {/if}
    </form>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>