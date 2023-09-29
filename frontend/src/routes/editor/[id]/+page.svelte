<script>
	/** @type {import('./$types').PageData} */
	import toast, { Toaster } from 'svelte-french-toast';
	import Editor from '$lib/components/Editor.svelte';
	import {currentVideoPlayerTime, currentTranscription} from '$lib/stores';
	import { CLIENT_API_HOST } from '$lib/utils';


	let video;
	let tolerance = 0.1; // Tolerance level in seconds
	let canPlay = false;
	$: if(canPlay && video && Math.abs(video.currentTime - $currentVideoPlayerTime) > tolerance) {
		console.log(video.currentTime, $currentVideoPlayerTime)
		// When testing in Chrome, it works, just see https://stackoverflow.com/a/67584611
        video.currentTime = $currentVideoPlayerTime;
    }
</script>

<Toaster />
{#if $currentTranscription}
	<div class="grid h-screen grid-cols-3 overflow-hidden">
		<div class="col-span-1 overflow-hidden bg-transparent">
			<div class="relative w-full h-full">
				<video id="video" 
					   controls
					   bind:this={video}
					   on:timeupdate={(e) => $currentVideoPlayerTime = e.target.currentTime}
					   on:canplay={() => canPlay = true}
					   on:loadedmetadata={() => canPlay = true}
					   class="absolute top-0 left-0 w-full h-full">
					<source src="{CLIENT_API_HOST}/api/video/{$currentTranscription.fileName}" type="video/mp4" />
					<track kind="captions" />
				</video>
			</div>
		</div>
		<div class="col-span-2 overflow-auto bg-content">
			<Editor />
		</div>
	</div>
{:else}
	<div class="flex items-center justify-center w-screen h-screen">
		<h1>
			<span class="loading loading-bars loading-lg" />
		</h1>
	</div>
{/if}
