<script lang="ts">
	import { selectedPlaylist, targetPlaylist, currentTracks, originalTrackOrder, currentTrackIndex, currentTrack, isPlaying, playbackPosition, currentPlaylistSnapshot, isPlaylistSelectorOpen, userLibrary, isLibraryLoading, isShuffleOn, user } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import { webPlaybackService } from '$lib/webPlayback';
	import { tokenManager } from '$lib/tokenManager';
	import { formatDuration, isTrackPlayable, togglePlayPause, removeTrack, moveTrack, copyTrack, toggleTrackInLibrary } from '$lib/utils';
	import { toastStore } from '$lib/toast';
	import type { SpotifyTrack } from '$lib/spotify';

	let tracks: SpotifyTrack[] = [];
	let loading = false;
	let currentLoadingPlaylistId: string | null = null;

	$: tracks = $currentTracks;
	$: isTrackInLibrary = (trackId: string): boolean => {
		return $userLibrary.has(trackId);
	};
	$: isTrackInPlaylist = (trackId: string): boolean => {
		return false;
	};
	$: isUserOwner = $selectedPlaylist?.owner?.id === $user?.id;
	$: canRemove = isUserOwner;
	$: canMove = isUserOwner && !!$targetPlaylist;
	$: canCopy = !!$targetPlaylist;

	const dummyTrackDuration = {
		set: () => {},
		subscribe: () => () => {},
		update: () => {}
	};

	const stores = {
		isPlaying,
		currentTrack,
		currentTracks,
		currentTrackIndex,
		playbackPosition,
		trackDuration: dummyTrackDuration,
		selectedPlaylist,
		targetPlaylist
	};

	const services = {
		spotifyAPI,
		webPlaybackService,
		toastStore
	};

	$: if ($selectedPlaylist) {
		loadTracks();
	}

	async function handleAPIError<T>(apiCall: () => Promise<T>): Promise<T | null> {
		try {
			const tokenValid = await tokenManager.checkAndRefreshToken();
			if (!tokenValid) {
				console.error('Invalid token, cannot make API call');
				return null;
			}
			
			return await apiCall();
		} catch (error) {
			console.error('API call failed:', error);

			if (error instanceof Error && error.message.includes('401')) {
				try {
					console.log('Retrying API call after token refresh...');
					await tokenManager.checkAndRefreshToken();
					return await apiCall();
				} catch (retryError) {
					console.error('Retry failed:', retryError);
					return null;
				}
			}
			
			return null;
		}
	}

	async function loadTracks() {
		if (!$selectedPlaylist) return;
		
		const playlistIdToLoad = $selectedPlaylist.id;
		const playlistName = $selectedPlaylist.name;

		currentLoadingPlaylistId = playlistIdToLoad;
		
		loading = true;
		tracks = [];
		currentTracks.set([]);
		originalTrackOrder.set([]);
		isShuffleOn.set(false);
		
		try {
			console.log(`Loading tracks for playlist: ${playlistName} (ID: ${playlistIdToLoad})`);
			
			const tracksData = await handleAPIError(() => spotifyAPI.getPlaylistTracks(playlistIdToLoad));

			if (currentLoadingPlaylistId !== playlistIdToLoad) {
				console.log(`Ignoring stale results for playlist: ${playlistName} (ID: ${playlistIdToLoad})`);
				return;
			}
			
			if (tracksData) {
				tracks = tracksData;
				currentTracks.set(tracks);
				originalTrackOrder.set([...tracks]);
				currentPlaylistSnapshot.set($selectedPlaylist.snapshot_id);
				console.log(`Successfully loaded ${tracks.length} tracks for ${playlistName}`);

				const unavailableTracks = tracks.filter(track => !isTrackPlayable(track));
				if (unavailableTracks.length > 0) {
					console.log(`Found ${unavailableTracks.length} unavailable tracks out of ${tracks.length} total`);
				}
			} else {
				console.error('Failed to load playlist data');
				tracks = [];
				currentTracks.set([]);
			}
		} catch (error) {
			if (currentLoadingPlaylistId === playlistIdToLoad) {
				console.error('Failed to load tracks:', error);
				tracks = [];
				currentTracks.set([]);
			}
		} finally {
			if (currentLoadingPlaylistId === playlistIdToLoad) {
				loading = false;
			}
		}
	}

	async function togglePlayPauseHandler(track: SpotifyTrack) {
		await togglePlayPause(track, tracks, stores, services);
	}

	async function removeTrackHandler(track: SpotifyTrack) {
		await removeTrack(track, tracks, stores, services, handleAPIError);
	}

	async function moveTrackHandler(track: SpotifyTrack) {
		await moveTrack(track, tracks, stores, services, handleAPIError);
	}

	async function copyTrackHandler(track: SpotifyTrack) {
		await copyTrack(track, tracks, stores, services, handleAPIError);
	}

	async function addTrackHandler(track: SpotifyTrack) {
		console.log(isTrackInLibrary(track.id));
		await toggleTrackInLibrary(track, services);
	}

	function openPlaylistSelector() {
		isPlaylistSelectorOpen.set(true);
	}
</script>

<div class="track-list-container">
	{#if $selectedPlaylist}
		<div class="playlist-header">
			<div class="playlist-info-container">
				<div class="playlist-selected-info">
					{#if $selectedPlaylist.images?.[0]?.url}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<img 
							src={$selectedPlaylist.images[0].url} 
							alt="Playlist cover"
							class="playlist-cover"
							on:click={openPlaylistSelector}
						/>
					{:else}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="playlist-cover playlist-cover-default" on:click={openPlaylistSelector}>
							<i class="fas fa-music"></i>
						</div>
					{/if}
					<div class="playlist-info">
						<div class="playlist-title" title="{$selectedPlaylist.name}">{$selectedPlaylist.name}</div>
						<div class="playlist-description" title="{$selectedPlaylist.description || 'No description'}">{$selectedPlaylist.description || 'No description'}</div>
						<div class="playlist-track-count">{tracks.length > 0 ? tracks.length + ' tracks' : ''}</div>
					</div>
				</div>
				<div class="playlist-separator fa fa-angles-right"></div>
				<div class="playlist-target-info">
					{#if $targetPlaylist && $targetPlaylist.images?.[0]?.url}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<img 
							src={$targetPlaylist.images[0].url} 
							alt="Playlist cover"
							class="playlist-cover"
							on:click={openPlaylistSelector}
						/>
					{:else}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="playlist-cover playlist-cover-default" on:click={openPlaylistSelector}>
							<i class="fas fa-music"></i>
						</div>
					{/if}
					<div class="playlist-info">
						<div class="playlist-title" title="{$targetPlaylist?.name || ''}">{$targetPlaylist ? $targetPlaylist.name : ''}</div>
						<div class="playlist-description" title="{$targetPlaylist?.description || 'No description'}">{$targetPlaylist ? ($targetPlaylist.description || 'No description') : ''}</div>
						<div class="playlist-track-count">{$targetPlaylist ? ($targetPlaylist.tracks?.total || 0) + ' tracks' : ''}</div>
					</div>
				</div>
			</div>
		</div>
		{#if loading}
			<div class="loading">
				<i class="fas fa-spinner fa-spin"></i>
				Loading all tracks from playlist...
			</div>
		{:else if tracks.length === 0}
			<div class="empty-state">
				<i class="fas fa-music fa-3x"></i>
				<p>This playlist is empty</p>
			</div>
		{:else}
			<div class="track-list">
				<div class="track-header">
					<span class="track-number">#</span>
					<span class="track-title">Title</span>
					<span class="track-artist">Artist</span>
					<span class="track-album">Album</span>
					<span class="track-duration">Duration</span>
					<span class="track-actions">Actions</span>
				</div>
				{#each tracks as track, index}
					{@const isCurrentTrack = $currentTrack && $currentTrack.id === track.id}
					{@const trackPlayable = isTrackPlayable(track)}
					<div class="track-item" class:current-track={isCurrentTrack} class:unavailable-track={!trackPlayable}>
						<span class="track-number">
						{#if isCurrentTrack}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_interactive_supports_focus -->
							<div 
								class="action-btn fas {isCurrentTrack && $isPlaying ? 'fa-pause' : 'fa-play'}" 
								on:click={() => togglePlayPauseHandler(track)}
								aria-label={isCurrentTrack && $isPlaying ? 'Pause track' : 'Play track'}
								role="button"
							>
							</div>
						{:else}
							{#if trackPlayable}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_interactive_supports_focus -->
								<div 
									class="track-number-btn"
									on:click={() => togglePlayPauseHandler(track)}
									aria-label="Play track"
									role="button"
									>
									<span class="track-number-index">{index + 1}</span>
									<i class="track-number-icon fas fa-play"></i>
								</div>
							{:else}
								<div 
									class="action-btn play-btn fas fa-ban disabled"
									aria-label="Track unavailable"
									title="This track is not available for playback"
								>
								</div>
							{/if}
						{/if}
						</span>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<div 
							class="track-title"
							class:not-playable={!trackPlayable}
   							on:click={() => trackPlayable && togglePlayPauseHandler(track)}
							aria-label="Play track"
							role="button"
						>
							{#if track.album.images[2]?.url || track.album.images[0]?.url}
								<img 
									src={track.album.images[2]?.url || track.album.images[0]?.url} 
									alt="Album cover"
									class="track-cover"
									class:grayscale={!trackPlayable}
								/>
							{:else}
								<div class="track-cover track-cover-default" class:grayscale={!trackPlayable}>
									<i class="fas fa-compact-disc"></i>
								</div>
							{/if}
							<span class="track-name" class:current-track-title={isCurrentTrack} class:unavailable-title={!trackPlayable}>
								{track.name}
								{#if !trackPlayable}
									<span class="unavailable-badge">Unavailable</span>
								{/if}
							</span>
						</div>
						<span class="track-artist" class:unavailable-text={!trackPlayable}>{track.artists.map(a => a.name).join(', ')}</span>
						<span class="track-album" class:unavailable-text={!trackPlayable}>{track.album.name}</span>
						<span class="track-duration" class:unavailable-text={!trackPlayable}>{formatDuration(track.duration_ms)}</span>
						<div class="track-actions">							
							{#if canRemove}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_interactive_supports_focus -->
								<div 
									class="action-btn remove-btn far fa-trash-can fa-xl" 
									on:click={() => removeTrackHandler(track)}
									aria-label="Remove from playlist"
									title="Remove from playlist"
									role="button"
								>
								</div>
							{:else}
								<div 
									class="action-btn remove-btn far fa-trash-can fa-xl action-btn-disabled" 
									aria-label="Remove from playlist (disabled)"
									title="You can only remove tracks from playlists you own"
								>
								</div>
							{/if}
							{#if trackPlayable && canMove && $targetPlaylist && $targetPlaylist.id !== $selectedPlaylist?.id}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_interactive_supports_focus -->
								<div 
									class="action-btn move-btn fa fa-plus-minus fa-xl"
									on:click={() => moveTrackHandler(track)}
									aria-label="Move to target playlist"
									title="Move to target playlist"
									role="button"
								>
								</div>
							{:else}
								<div 
									class="action-btn move-btn fa fa-plus-minus fa-xl action-btn-disabled" 
									aria-label="Move to target playlist (disabled)"
									title={!isUserOwner ? 'You can only move tracks from playlists you own' : ($targetPlaylist ? ($targetPlaylist.id === $selectedPlaylist?.id ? 'Select a different target playlist' : 'Select a target playlist') : 'Select a target playlist')}
								>
								</div>
							{/if}
							{#if trackPlayable && canCopy && $targetPlaylist && $targetPlaylist.id !== $selectedPlaylist?.id}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_interactive_supports_focus -->
								<div 
									class="action-btn copy-btn {isTrackInPlaylist(track.id) ? 'fas' : 'far'} fa-square-plus fa-xl" 
									class:in-playlist={isTrackInPlaylist(track.id)}
									on:click={() => copyTrackHandler(track)}
									aria-label="Copy to target playlist"
									title="Copy to target playlist"
									role="button"
								>
								</div>
							{:else}
								<div 
									class="action-btn copy-btn far fa-square-plus fa-xl action-btn-disabled" 
									aria-label="Copy to target playlist (disabled)"
									title={$targetPlaylist ? ($targetPlaylist.id === $selectedPlaylist?.id ? 'Select a different target playlist' : 'Select a target playlist') : 'Select a target playlist'}
								>
								</div>
							{/if}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_interactive_supports_focus -->
							<div 
								class="action-btn add-btn {$isLibraryLoading ? 'fas fa-spinner fa-spin-pulse fa-xl action-btn-disabled' : (isTrackInLibrary(track.id) ? 'fas' : 'far') + ' fa-heart fa-xl ' + (isTrackInLibrary(track.id) ? 'in-library' : '')}" 
								on:click={$isLibraryLoading ? null : () => addTrackHandler(track)}
								aria-label={$isLibraryLoading ? 'Loading library...' : (isTrackInLibrary(track.id) ? 'Remove from library' : 'Add to library')}
								title={$isLibraryLoading ? 'Loading library...' : (isTrackInLibrary(track.id) ? 'Remove from library' : 'Add to library')}
								role="button"
							>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="no-playlist">
			<i class="no-playlist-icon fas fa-music fa-3x"></i>
			<button class="playlist-selector-btn" on:click={openPlaylistSelector}>
				<i class="fas fa-list"></i>
				Choose Playlists
			</button>
		</div>
	{/if}
</div>

<style>
	.track-list-container {
		background: #ffffff04;
		backdrop-filter: blur(10px);
		border-radius: 12px;
		border: 1px solid #1e1e1eff;
		overflow: hidden;
	}

	.playlist-header {
    	display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		background: linear-gradient(135deg, #061a0d33, #1ed7601a);
	}

	.playlist-info-container {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    	justify-content: space-around;
	}

	.playlist-selected-info, .playlist-target-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.playlist-separator {
		display: flex;
		align-items: center;
		justify-content: center;
		height: clamp(142px, 15vw, 300px);
		color: #b3b3b3ff;
		font-size: clamp(2rem, 6vw, 60px);
	}

	.playlist-cover {
		width: clamp(142px, 15vw, 300px);
		height: clamp(142px, 15vw, 300px);
		border-radius: 8px;
		object-fit: cover;
		cursor: pointer;
	}

	.playlist-cover-default {
		background: #ffffff1a;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #ffffff33;
	}

	.playlist-cover-default i {
		font-size: 2.5rem;
		color: #ffffffb3;
	}

	.playlist-info {
    	display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
		gap: .5rem;
		max-width: -webkit-fill-available;
	}

	.playlist-title {
		margin: 0;
		font-size: 1.8rem;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: center;
		max-width: -webkit-fill-available;
		padding-bottom: 2px;
	}

	.playlist-description {
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: center;
		max-width: -webkit-fill-available;
		padding-bottom: 2px;
	}

	.playlist-track-count {
		color: #1db954ff;
		font-weight: 600;
		text-align: center;
	}

	.playlist-actions {
		display: flex;
		justify-content: center;
		gap: 1rem;
	}

	.no-playlist-icon {
		margin-bottom: 1rem;
		color: #1db954ff;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
	}

	.loading {
		display: flex;
		color: #f3f3f3ff;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		gap: 0.5rem;
	}

	.loading i {
		color: #1db954ff;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.no-playlist {
		padding: 3rem;
		color: #b3b3b3ff;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.track-list {
		padding: 0;
		line-height: 1;
	}

	.not-playable {
		cursor: not-allowed !important;
		pointer-events: none;
	}

	.track-header, .track-item {
		display: grid;
		grid-template-columns: 50px 2fr 1.5fr 1.5fr 100px 150px;
		gap: 1rem;
		padding: 1rem 2rem;
		align-items: center;
	}

	.track-header {
		background: #ffffff0d;
		font-weight: 600;
		color: #b3b3b3ff;
		text-transform: uppercase;
		font-size: 0.85rem;
		letter-spacing: 0.5px;
	}

	.track-item {
		border-bottom: 1px solid #1e1e1eff;
		transition: background-color 0.2s ease;
		content-visibility: auto;
	}

	.track-item.current-track {
		background: #1db9541a;
		box-shadow: inset 3px 0px 0px 0px #1db954ff;
	}

	.track-item:last-child {
		border-bottom: none;
	}

	.track-number {
		display: flex;
		justify-content: center;
		color: #b3b3b3ff;
	}

	.track-number-icon {
		display: none;
	}

	.track-title {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-width: 0;
		cursor: pointer;
	}

	.current-track-title {
		color: #1db954ff !important;
		font-weight: 700;
	}

	.track-cover {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.track-cover-default {
		background: #ffffff1a;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #ffffff33;
	}

	.track-cover-default i {
		font-size: 1.2rem;
		color: #ffffffb3;
	}

	.track-name, .track-artist, .track-album {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: #b3b3b3ff;
		padding-bottom: 1px;
	}

	.track-name {
		font-weight: 600;
		color: #f3f3f3ff;
		padding-right: 16px;
	}

	.track-duration {
		text-align: center;
		color: #b3b3b3ff;
	}

	.track-actions {
		display: flex;
		justify-content: center;
	}

	.action-btn {
		color: #b3b3b3ff;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
	}

	.action-btn-disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.play-btn {
		background: #1db954ff;
		color: #f3f3f3ff;
	}

	.add-btn.in-library {
		color: #1db954ff;
	}

	.copy-btn.in-playlist {
		color: #1db954ff;
	}

	/* Unavailable track styles */
	.unavailable-track {
		opacity: 0.5;
		background: #ffffff05 !important;
	}

	.unavailable-text {
		color: #666666ff !important;
	}

	.unavailable-title {
		color: #666666ff !important;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.unavailable-badge {
		background: #ff453acc;
		color: #f3f3f3ff;
		font-size: 0.7rem;
		padding: 2px 6px;
		border-radius: 4px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.grayscale {
		filter: grayscale(100%);
		opacity: 0.6;
	}

	.action-btn.disabled {
		background: #ffffff1a !important;
		color: #666666ff !important;
		cursor: not-allowed !important;
		opacity: 0.5;
	}

	.playlist-selector-btn {
		background: #1db95433;
		color: #1db954ff;
		border: 1px solid #1db95433;
		padding: 0.5rem;
		border-radius: 5px;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		gap: 0.25rem;
		font-size: .75rem;
		align-items: center;
		font-weight: 500;
	}

	@media (max-width: 1024px) {
		.track-header, .track-item {
			grid-template-columns: 40px 2fr 1fr 80px 120px;
			gap: 0.5rem;
			padding: 1rem;
		}

		.track-album {
			display: none;
		}
	}

	@media (max-width: 768px) {
		.track-header, .track-item {
			grid-template-columns: 1fr 200px;
			gap: 1rem;
			align-items: unset;
		}

		.track-number, .track-artist, .track-duration {
			display: none;
		}

		.track-cover {
			width: 64px;
			height: 64px;
		}

		.track-title {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.track-name {
			width: calc(100vw - 24px)
		}

		.track-actions {
			justify-content: flex-end;
			align-items: center;
		}

		.action-btn {
			width: 64px;
			height: 64px;
			font-size: 2rem;
		}
	}

	@media (hover: hover) {
		.action-btn-disabled:hover {
			color: gray !important;
			transform: none !important;
		}

		.unavailable-track:hover {
			background: #ffffff08 !important;
		}

		.action-btn:hover {
			color: #00ff0dcc;
			transform: scale(1.1);
		}

		.play-btn:hover {
			background: #1ed760ff;
			transform: scale(1.1);
		}

		.track-number-btn:hover .track-number-index {
			display: none;
		}

		.track-number-btn:hover .track-number-icon {
			display: inline;
		}

		.track-number-btn:hover {
			cursor: pointer;
		}

		.track-item.current-track:hover {
			background: #1db95426;
		}

		.track-item:hover {
			background: #ffffff0d;
		}
	}

</style>
