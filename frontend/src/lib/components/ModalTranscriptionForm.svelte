<script>
	import { validateURL, CLIENT_API_HOST } from '$lib/utils.js';

	import toast from 'svelte-french-toast';

	let errorMessage = '';
	let disableSubmit = true;
	let modelSize = 'small';
	let language = 'auto';
	let sourceUrl = '';
	let fileInput;

	let languages = [
		'auto',
		'ar',
		'be',
		'bg',
		'bn',
		'ca',
		'cs',
		'cy',
		'da',
		'de',
		'el',
		'en',
		'es',
		'fr',
		'it',
		'jp',
		'nl',
		'pl',
		'pt',
		'ru',
		'sk',
		'sl',
		'sv',
		'tk',
		'tr',
		'zh'
	];
	let models = [
		'tiny',
		'tiny.en',
		'base',
		'base.en',
		'small',
		'small.en',
		'medium',
		'medium.en',
		'large-v2'
	];
	// Sort the languages
	languages.sort((a, b) => {
		if (a == 'auto') return -1;
		if (b == 'auto') return 1;
		return a.localeCompare(b);
	});

	// Function that sends the data as a form to the backend
	async function sendForm() {
		if (sourceUrl && !validateURL(sourceUrl)) {
			toast.error('You must enter a valid URL.');
			return;
		}

		if (!sourceUrl && !fileInput) {
			toast.error('No file or URL.');
			return;
		}

		let formData = new FormData();
		formData.append('language', language);
		formData.append('modelSize', modelSize);
		formData.append('sourceUrl', sourceUrl);
		if (sourceUrl == '') {
			formData.append('file', fileInput.files[0]);
		}

		const res = await fetch(`${CLIENT_API_HOST}/api/transcriptions`, {
			method: 'POST',
			body: formData
		});

		// Set file and sourceUrl to empty
		sourceUrl = '';
		fileInput.value = '';

		toast.success('Success!');
	}

	// Reactive statement
	$: if (sourceUrl && !validateURL(sourceUrl)) {
		errorMessage = 'Enter a valid URL';
		disableSubmit = true;
	} else {
		errorMessage = '';
		disableSubmit = false;
	}
</script>

<dialog id="modalNewTranscription" class="modal">
	<form method="dialog" class="modal-box">
		<button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
		{#if errorMessage != ''}
			<div class="alert alert-error">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="stroke-current shrink-0 h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
				<span>{errorMessage}</span>
			</div>
		{/if}
		<div class="space-y-2 mt-0">
			<div class="form-control w-full max-w-xs">
				<label for="file" class="label">
					<span class="label-text">Pick a file</span>
				</label>
				<input
					name="file"
					bind:this={fileInput}
					type="file"
					class="file-input file-input-sm file-input-bordered file-input-primary w-full max-w-xs"
				/>
			</div>

			<div class="form-control w-full max-w-xs">
				<label for="sourceUrl" class="label">
					<span class="label-text">Or a source URL</span>
				</label>
				<input
					name="sourceUrl"
					bind:value={sourceUrl}
					type="text"
					placeholder="https://youtube.com/watch?v=Hd33fCdW"
					class="input input-sm input-bordered input-primary w-full max-w-xs"
				/>
			</div>
		</div>

		<div class="divider mb-0" />
		<!-- Whisper Configuration -->
		<div class="flex space-x-4">
			<div class="form-control w-full max-w-xs">
				<label for="modelSize" class="label">
					<span class="label-text">Whisper model</span>
				</label>
				<select name="modelSize" bind:value={modelSize} class="select select-bordered">
					{#each models as m}
						<option value={m}>{m}</option>
					{/each}
				</select>
			</div>

			<div class="form-control w-full max-w-xs">
				<label for="language" class="label">
					<span class="label-text">Language</span>
				</label>
				<select name="language" bind:value={language} class="select select-bordered">
					{#each languages as l}
						<option value={l}>{l}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="divider mb-0" />
		<!--Actions-->
		<button class="btn btn-wide btn-primary" on:click={sendForm} disabled={disableSubmit}
			>Start</button
		>
	</form>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>
