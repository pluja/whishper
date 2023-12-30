<script>
	import { Toaster } from 'svelte-french-toast';
	import { transcriptions, uploadProgress } from '$lib/stores';
	import { browser, dev } from '$app/environment';
	import { CLIENT_WS_HOST } from '$lib/utils';
	import { onMount, onDestroy } from 'svelte';
	import ModalTranscriptionForm from '$lib/components/ModalTranscriptionForm.svelte';
	import ModalDownloadOptions from '$lib/components/ModalDownloadOptions.svelte';
	import ModalTranslationForm from '$lib/components/ModalTranslationForm.svelte';
	import SuccessTranscription from '$lib/components/SuccessTranscription.svelte';
	import PendingTranscription from '$lib/components/PendingTranscription.svelte';
	import PendingTranslation from '$lib/components/PendingTranslation.svelte';
	import ErrorTranscription from '$lib/components/ErrorTranscription.svelte';

	//export let data;
	let socket;
	export let data;

	function connect() {
		if (!browser) {
			console.log('Server, not connecting');
			return;
		}

		let new_uri = '';
		var loc = window.location;
		if (loc.protocol === 'https:') {
			new_uri = 'wss:';
		} else {
			new_uri = 'ws:';
		}
		new_uri += '//' + (CLIENT_WS_HOST == '' ? loc.host : CLIENT_WS_HOST);
		new_uri += '/ws/transcriptions';
		console.log('Connecting to: ', new_uri);
		socket = new WebSocket(new_uri);

		socket.onopen = () => console.log('WebSocket is connected...');
		socket.onerror = (error) => console.log('WebSocket Error: ', error);
		socket.onclose = (event) => {
			console.log('WebSocket is closed with code: ', event.code, ' and reason: ', event.reason);
			setTimeout(() => {
				console.log('Reconnecting...');
				connect();
			}, 1000);
		};

		socket.onmessage = (event) => {
            let update = JSON.parse(event.data);
            // use update to update the store
            transcriptions.update(transcriptions => {
                let index = transcriptions.findIndex(tr => tr.id === update.id);
                if (index >= 0) {
                    // replace the item at index
                    transcriptions[index] = update;
                } else {
                    // add the new item
                    transcriptions.push(update);
                }
                return transcriptions; // return a new object to trigger reactivity
            });
        };
	}

	onMount(() => {
		connect();
	});

	let downloadTranscription = null;
	let handleDownload = (event) => {
		downloadTranscription = event.detail; // this will be the transcription to download
		modalDownloadOptions.showModal(); // show the modal
	};
	let translateTranscription = null;
	let handleTranslate = (event) => {
		translateTranscription = event.detail; // this will be the transcription to translate
		modalTranslation.showModal(); // show the modal
	};

	onDestroy(() => {
		if (socket) {
			socket.close(1000);
		}
	});
</script>

<Toaster />
<ModalDownloadOptions tr={downloadTranscription} />
<ModalTranslationForm tr={translateTranscription} />
<ModalTranscriptionForm />

<header>
	<h1 class="flex items-center justify-center mt-8 space-x-4 text-4xl font-bold">
		<span>
			<img class="w-20 h-20" src="/logo.svg" alt="Logo: a cloud whispering" />
		</span>
		<span> Whishper </span>
	</h1>
	<h2 class="font-mono text-center text-md opacity-70">{data.randomSentence}</h2>
</header>

<main class="w-4/6 mx-auto mt-4 mb-8 card bg-neutral text-neutral-content">
	{#if $uploadProgress > 0}
		<div class="flex flex-col items-center justify-center px-4 pt-4 my-4">
			<progress class="w-full mx-2 progress progress-success" value="{$uploadProgress}" max="100"></progress>
			<span>Uploading...</span>
		</div>
	{:else}
		<button
			class="max-w-md mx-auto mt-8 btn btn-primary btn-md"
			onclick="modalNewTranscription.showModal()">✨ new transcription</button
		>
	{/if}
	<div class="items-center mb-0 text-center card-body">
		{#if $transcriptions.length > 0}
			{#each $transcriptions.slice().reverse() as tr (tr.id)}
				{#if tr.status == 2}
					<SuccessTranscription {tr} on:download={handleDownload} on:translate={handleTranslate} />
				{/if}
				{#if tr.status < 2 && tr.status >= 0}
					<PendingTranscription {tr} />
				{/if}
				{#if tr.status == 3}
					<PendingTranslation {tr} />
				{/if}
				{#if tr.status < 0}
					<ErrorTranscription {tr} />
				{/if}
			{/each}
		{:else}
			<p class="text-2xl font-bold text-center">🔮 No transcriptions yet 🔮</p>
		{/if}
	</div>
</main>
