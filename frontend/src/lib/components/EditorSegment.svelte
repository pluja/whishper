<script>
	import { editorSettings } from '$lib/stores';
	import { currentVideoPlayerTime, currentTranscription, editorHistory } from '$lib/stores';
	export let index;
	export let segment;
	export let translationIndex;

	let isActive = false;

	function getCps(s) {
		// Find duration
		let duration = s.end - s.start;

		// Count characters
		let charCount = s.text.length;

		// Calculate CPS
		let cps = charCount / duration;

		// Round to 2 decimals
		cps = Math.round(cps * 100) / 100;
		// Truncate to integer
		return Math.trunc(cps);
	}

	function deleteSegment(index, callback) {
		console.log($currentTranscription)
		const source =
			translationIndex == -1
				? $currentTranscription.result.segments
				: $currentTranscription.translations[translationIndex].result.segments;
		source.splice(index, 1);
		// Update index
		$currentTranscription = { ...$currentTranscription }; // deep copy
		callback();
	}

	// This function takes a segment and splits it into two segments at the given index
	function splitSegment(index, callback) {
		// Choose the correct source based on translationIndex
		const source =
			translationIndex == -1
				? $currentTranscription.result.segments
				: $currentTranscription.translations[translationIndex].result.segments;

		const segment = source[index];
		const words = segment.text.split(' ');
		const half = Math.ceil(words.length / 2);
		const firstHalf = words.slice(0, half).join(' ');
		const secondHalf = words.slice(half).join(' ');

		const duration = segment.end - segment.start;
		const midTime = segment.start + duration / 2;

		// Update current segment
		segment.text = firstHalf;
		segment.end = midTime;

		// Create and insert new segment
		const newSegment = {
			id: JSON.stringify(Date.now()),
			start: midTime,
			end: segment.end + duration / 2,
			text: secondHalf,
			words: []
		};
		source.splice(index + 1, 0, newSegment);

		$currentTranscription = { ...$currentTranscription };
		callback();
	}

	// Text changes only save after 6 keystrokes
	let keystrokes = 0;
	function handleKeystrokes() {
		keystrokes++;
		if (keystrokes > 6) {
			handleHistory();
			keystrokes = 0;
		}
	}

	// Save history on editing
	function handleHistory() {
		let currentT = JSON.parse(JSON.stringify($currentTranscription));
		editorHistory.update((value) => {
			return [...value, currentT];
		});
	}

	function insertSegmentAbove(index, callback) {
		const source =
			translationIndex == -1
				? $currentTranscription.result.segments
				: $currentTranscription.translations[translationIndex].result.segments;
		source.splice(index, 0, {
			id: JSON.stringify(Date.now()),
			start: 0,
			end: 0,
			text: '',
			words: []
		});
		$currentTranscription = { ...$currentTranscription }; // deep copy
		callback();
	}

	function insertSegmentBelow(index, callback) {
		const source =
			translationIndex == -1
				? $currentTranscription.result.segments
				: $currentTranscription.translations[translationIndex].result.segments;
		source.splice(index + 1, 0, {
			id: JSON.stringify(Date.now()),
			start: 0,
			end: 0,
			text: '',
			words: []
		});
		$currentTranscription = { ...$currentTranscription }; // deep copy
		callback();
	}

	$: if (segment.start <= $currentVideoPlayerTime && $currentVideoPlayerTime <= segment.end) {
		isActive = true;
	} else {
		isActive = false;
	}
</script>

<tr class:bg-warning={isActive} class:bg-opacity-30={isActive} data-start={segment.start}>
	<th>{index}</th>
	<td class="space-x-2">
		<!-- Start input -->
		<input
			class="w-20 input input-sm input-bordered"
			type="number"
			step="0.01"
			bind:value={segment.start}
			on:input={(e) => ($currentVideoPlayerTime.set(e.target.value))}
			on:input={handleHistory}
			on:click={(e) => {
				if ($editorSettings.seekOnClick) $currentVideoPlayerTime = e.target.value;
			}}
		/>
		<span class="tooltip" data-tip="Set to current time">
			<button
				on:click={() => {
					segment.start = $currentVideoPlayerTime;
					handleHistory();
				}}
				class="btn btn-xs btn-primary"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="w-4 h-4 stroke-white"
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
					<path d="M12 7v5l2 2" />
					<path d="M17 22l5 -3l-5 -3z" />
					<path d="M13.017 20.943a9 9 0 1 1 7.831 -7.292" />
				</svg>
			</button>
		</span>
	</td>
	<td class="space-x-2">
		<!-- End input -->
		<input
			class="w-20 input input-sm input-bordered"
			type="number"
			step="0.01"
			bind:value={segment.end}
			on:input={(e) => ($currentVideoPlayerTime = e.target.value)}
			on:input={handleHistory}
			on:click={(e) => {
				if ($editorSettings.seekOnClick) $currentVideoPlayerTime = e.target.value;
			}}
		/>
		<span class="tooltip" data-tip="Set to current time">
			<button
				on:click={() => {
					segment.end = $currentVideoPlayerTime;
					handleHistory();
				}}
				class="btn btn-xs btn-primary"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="w-4 h-4 stroke-white"
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
					<path d="M12 7v5l2 2" />
					<path d="M17 22l5 -3l-5 -3z" />
					<path d="M13.017 20.943a9 9 0 1 1 7.831 -7.292" />
				</svg>
			</button>
		</span>
	</td>
	<td>
		<!-- Text input -->
		<div
			bind:textContent={segment.text}
			on:input={handleKeystrokes}
			class="max-w-md p-3 font-mono font-bold border-2 rounded-lg bg-base-100"
			class:border-error={getCps(segment) > 16}
			contenteditable="true"
		/>
	</td>
	<td>
		<div>
			<span class="flex flex-col flex-grow text-xs">
				<span class:text-error={getCps(segment) > 16}>
					<span class="font-mono font-bold whitespace-nowrap">
						CPS: {getCps(segment)}
					</span>
				</span>
				<span>
					<span class="font-mono font-bold whitespace-nowrap">
						Duration: {Math.round((segment.end - segment.start) * 100) / 100}s
					</span>
				</span>
			</span>
		</div>
	</td>
	<td
		class="flex flex-col items-center justify-center space-x-1 space-y-2 align-middle md:space-y-0 lg:flex-row"
	>
		<!-- Add above -->
		<span class="tooltip" data-tip="Insert Above">
			<button
				on:click={() => insertSegmentAbove(index, handleHistory)}
				class="btn btn-primary btn-xs md:btn-sm btn-square"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="w-5 h-5"
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
					<path
						d="M20 6v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1z"
					/>
					<path d="M12 15l0 4" />
					<path d="M14 17l-4 0" />
				</svg>
			</button>
		</span>
		<!-- Add below -->
		<span class="tooltip" data-tip="Insert Below">
			<button
				on:click={() => insertSegmentBelow(index, handleHistory)}
				class="btn btn-primary btn-xs md:btn-sm btn-square"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="w-5 h-5"
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
					<path
						d="M4 18v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1z"
					/>
					<path d="M12 9v-4" />
					<path d="M10 7l4 0" />
				</svg>
			</button>
		</span>
		<!-- Split -->
		<span class="tooltip" data-tip="Split segment">
			<button
				on:click={() => splitSegment(index, handleHistory)}
				class="btn btn-primary btn-xs md:btn-sm btn-square"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="icon icon-tabler icon-tabler-arrows-split"
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
					<path d="M21 17h-8l-3.5 -5h-6.5" />
					<path d="M21 7h-8l-3.495 5" />
					<path d="M18 10l3 -3l-3 -3" />
					<path d="M18 20l3 -3l-3 -3" />
				</svg>
			</button>
		</span>
		<!-- Delete -->
		<button
			on:click={deleteSegment(index, handleHistory)}
			class="btn btn-error btn-xs md:btn-sm btn-square"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="w-5 h-5"
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
				<path
					d="M20 6a1 1 0 0 1 .117 1.993l-.117 .007h-.081l-.919 11a3 3 0 0 1 -2.824 2.995l-.176 .005h-8c-1.598 0 -2.904 -1.249 -2.992 -2.75l-.005 -.167l-.923 -11.083h-.08a1 1 0 0 1 -.117 -1.993l.117 -.007h16zm-9.489 5.14a1 1 0 0 0 -1.218 1.567l1.292 1.293l-1.292 1.293l-.083 .094a1 1 0 0 0 1.497 1.32l1.293 -1.292l1.293 1.292l.094 .083a1 1 0 0 0 1.32 -1.497l-1.292 -1.293l1.292 -1.293l.083 -.094a1 1 0 0 0 -1.497 -1.32l-1.293 1.292l-1.293 -1.292l-.094 -.083z"
					stroke-width="0"
					fill="currentColor"
				/>
				<path
					d="M14 2a2 2 0 0 1 2 2a1 1 0 0 1 -1.993 .117l-.007 -.117h-4l-.007 .117a1 1 0 0 1 -1.993 -.117a2 2 0 0 1 1.85 -1.995l.15 -.005h4z"
					stroke-width="0"
					fill="currentColor"
				/>
			</svg>
		</button>
	</td>
</tr>
