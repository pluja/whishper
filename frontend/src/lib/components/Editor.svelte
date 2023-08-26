<script>
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import toast from 'svelte-french-toast';
	import { editorSettings, currentTranscription, editorHistory } from '$lib/stores';
	import EditorSettings from './EditorSettings.svelte';
	import EditorSegment from './EditorSegment.svelte';
	import { CLIENT_API_HOST } from '$lib/utils';


	let language = writable('original');

	// Segments lazy loading
	let segmentsToShow = 20;
	function loadMore() {
		segmentsToShow += 10;
	}
	let loadMoreButton;

	async function textFromSegments() {
		let text = '';
		if ($language == 'original') {
			text = $currentTranscription.result.segments
				.map((segment) => segment.text)
				.join(' ')
				.replace(/(\r\n|\n|\r)/gm, ' ');
		} else {
			text = $currentTranscription.translations
				.filter((translation) => translation.targetLanguage == $language)[0]
				.result.segments.map((segment) => segment.text)
				.join(' ')
				.replace(/(\r\n|\n|\r)/gm, ' ');
		}
		console.log(text);
		return text;
	}

	async function saveChanges() {
		var url = `${CLIENT_API_HOST}/api/transcriptions`; // replace with your actual endpoint
		console.log($language)
		// Update text to match segments
		if ($language == 'original') {
			$currentTranscription.result.text = await textFromSegments();
		} else {
			$currentTranscription.translations.forEach(async (translation) => {
				if (translation.targetLanguage == $language) translation.result.text = await textFromSegments();
			});
		}

		try {
			const response = await fetch(url, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify($currentTranscription)
			});

			if (!response.ok) {
				if (response.status === 304) {
					if (!$editorSettings.autoSave) {
						toast('No changes were made!', {
							icon: '👐'
						});
					}
					return;
				} else {
					toast.error("Couldn't save!");
					throw new Error(`HTTP error! status: ${response.status}`);
				}
			}

			if ($editorSettings.autoSave) {
				toast('Autosaving...', { icon: 'ℹ️' });
			} else {
				toast.success('Saved!');
			}
		} catch (error) {
			toast.error("Couldn't save!");
			console.error('Error:', error);
		}
	}

	let handleKeyDown;
	let observer;
	onMount(() => {
		// Lazy loading
		observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					loadMore();
				}
			});
		});
		observer.observe(loadMoreButton);

		// Function to handle Ctrl+Z and Ctrl+S shortcuts
		editorHistory.set([JSON.parse(JSON.stringify($currentTranscription))]);
		let isUndoing = false;
		handleKeyDown = function (e) {
			// Undo (CTRL+Z)
			if (e.ctrlKey && e.key === 'z' && !isUndoing) {
				isUndoing = true;
				let previousTranscription = null;

				editorHistory.update((history) => {
					if (history.length > 1) {
						history = history.slice(0, -1);
						previousTranscription = { ...history[history.length - 1] };
					}
					return history;
				});

				if (previousTranscription) {
					$currentTranscription = { ...previousTranscription };
				}
				isUndoing = false;
			}

			let isSaving = false;
			if (e.ctrlKey && e.key === 's') {
				e.preventDefault();
				if (!isSaving) {
					isSaving = true;
					saveChanges();
					isSaving = false;
				}
			}
		};

		if (!$editorSettings.autoSave) {
			toast('Autosave is disabled.', {
				icon: '👋'
			});
		}

		// Listen to keydown event
		document.addEventListener('keydown', handleKeyDown);
	});

	// Autosave
	let autosaveInterval;
	let autoSaveAux = $editorSettings.autoSave;
	$: if ($editorSettings.autoSave) {
		toast.success('Autosave enabled.');
		autoSaveAux = true;
		autosaveInterval = setInterval(() => {
			saveChanges();
		}, $editorSettings.autosaveInterval);
	} else {
		if (autoSaveAux == true) {
			toast('Autosave is disabled.', {
				icon: '👋'
			});
			autoSaveAux = false;
		}
		clearInterval(autosaveInterval);
	}
</script>

{#if $currentTranscription.status != 2}
	<div class="flex items-center justify-center">
		<span class="loading loading-spinner loading-lg"></span>
		<p class="text-center">Waiting for task to finish {$currentTranscription.status == 3 ? "translating" : "transcribing"}...</p>
	</div>
{:else}
<div class="flex flex-col items-center break-words">
	<h1 class="text-center text-2xl mt-8 break-words">
		{$currentTranscription.fileName.split('_WHSHPR_')[1]}
	</h1>
	<!-- Menu -->
	<ul class="menu menu-horizontal bg-base-200 rounded-box mt-6">
		<li>
			<a href="/" class="tooltip" data-tip="Home">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
					/></svg
				>
			</a>
		</li>
		<li>
			<button on:click={saveChanges} class="tooltip" data-tip="Save (Ctrl+S)">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="icon icon-tabler icon-tabler-device-floppy"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" />
					<path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
					<path d="M14 4l0 4l-6 0l0 -4" />
				</svg>
			</button>
		</li>
	</ul>
	<!-- End Menu -->

	{#if $currentTranscription.translations.length > 0}
		<div class="form-control max-w-xs my-4">
			<label for="language" class="label">
				<span class="label-text">Subtitles language</span>
			</label>
			<select
				bind:value={$language}
				name="language"
				class="select select-sm select-bordered uppercase"
			>
				<option value="original">✅ {$currentTranscription.result.language}</option>
				{#each $currentTranscription.translations as translation}
					<option value={translation.targetLanguage}>🤖 {translation.targetLanguage}</option>
				{/each}
			</select>
		</div>
	{/if}
</div>
<div class="mt-4">
	<!-- Editor configuration -->
	<EditorSettings />
	<!-- End Editor configuration -->

	<div class="overflow-x-auto">
		<!-- Segments table -->
		<table class="table px-4">
			<thead>
				<tr>
					<th />
					<th>Start</th>
					<th>End</th>
					<th>Text</th>
					<th>Info</th>
					<th />
				</tr>
			</thead>
			<tbody>
				{#if $language == 'original'}
					{#each $currentTranscription.result.segments.slice(0, segmentsToShow) as segment, index (segment.id)}
						<EditorSegment {segment} {index} translationIndex={-1} />
					{/each}
				{:else}
					{#each $currentTranscription.translations as translation, translationIndex}
						{#if translation.targetLanguage == $language}
							{#each translation.result.segments.slice(0, segmentsToShow) as segment, index (segment.id)}
								<EditorSegment {segment} {index} {translationIndex} />
							{/each}
						{/if}
					{/each}
				{/if}
			</tbody>
		</table>
		<button bind:this={loadMoreButton}>
			{#if $language == 'original'}
				{#if segmentsToShow >= $currentTranscription.result.segments.length}
					No more segments to load
				{:else}
					Loading more...
				{/if}
			{:else if segmentsToShow >= $currentTranscription.translations.filter((translation) => translation.targetLanguage == $language)[0].result.segments.length}
				No more segments to load
			{:else}
				Loading more...
			{/if}
		</button>
		<!-- End Segments table -->
	</div>
</div>
{/if}
