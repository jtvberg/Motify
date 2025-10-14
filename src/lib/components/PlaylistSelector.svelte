<script lang="ts">
	import { onMount } from 'svelte';
	import { user, playlists, selectedPlaylist, targetPlaylist, isPlaylistSelectorOpen, playlistSelections } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import type { SpotifyPlaylist } from '$lib/spotify';
	import Settings from './Settings.svelte';
	import ScraperButtons from './ScraperButtons.svelte';

	let userPlaylists: SpotifyPlaylist[] = [];
	let targetPlaylists: SpotifyPlaylist[] = [];
	let selectedId = '';
	let targetId = '';
	let hasLoadedUserData = false;

	$: userPlaylists = $playlists;
	$: targetPlaylists = $playlists.filter(playlist => 
		playlist.owner && $user && playlist.owner.id === $user.id
	);
	$: selectedId = $selectedPlaylist?.id || '';
	$: targetId = $targetPlaylist?.id || '';

	onMount(async () => {
		if (!$user || $playlists.length === 0) {
			try {
				if (!$user) {
					const userInfo = await spotifyAPI.getCurrentUser();
					user.set(userInfo);
				}

				if ($playlists.length === 0) {
					const playlistsData = await spotifyAPI.getUserPlaylists();
					playlists.set(playlistsData);

					restorePlaylistSelections(playlistsData);
				}
				
				hasLoadedUserData = true;
			} catch (error) {
				console.error('Failed to load user data:', error);
			}
		}
	});

	function restorePlaylistSelections(playlistsData: SpotifyPlaylist[]) {
		const selections = $playlistSelections;

		if (selections.source && !$selectedPlaylist) {
			const sourcePlaylist = playlistsData.find(p => 
				selections.source.includes(p.id) || 
				`https://open.spotify.com/playlist/${p.id}` === selections.source ||
				selections.source.includes(`playlist/${p.id}`)
			);
			if (sourcePlaylist) {
				console.log('Restoring source playlist:', sourcePlaylist.name);
				selectedPlaylist.set(sourcePlaylist);
				selectedId = sourcePlaylist.id;
			}
		}

		if (selections.target && !$targetPlaylist) {
			const targetPlaylistData = playlistsData.find(p => 
				selections.target.includes(p.id) || 
				`https://open.spotify.com/playlist/${p.id}` === selections.target ||
				selections.target.includes(`playlist/${p.id}`)
			);
			if (targetPlaylistData) {
				console.log('Restoring target playlist:', targetPlaylistData.name);
				targetPlaylist.set(targetPlaylistData);
				targetId = targetPlaylistData.id;
			}
		}
	}

	function handleSelectedPlaylistChange() {
		const playlist = userPlaylists.find(p => p.id === selectedId);
		const newPlaylist = playlist || null;

		if ($selectedPlaylist?.id !== newPlaylist?.id) {
			selectedPlaylist.set(newPlaylist);

			const sourceUrl = playlist ? `https://open.spotify.com/playlist/${playlist.id}` : '';
			playlistSelections.update(selections => ({
				...selections,
				source: sourceUrl
			}));
		}
	}

	function handleTargetPlaylistChange() {
		const playlist = targetPlaylists.find(p => p.id === targetId);
		const newPlaylist = playlist || null;

		if ($targetPlaylist?.id !== newPlaylist?.id) {
			targetPlaylist.set(newPlaylist);

			const targetUrl = playlist ? `https://open.spotify.com/playlist/${playlist.id}` : '';
			playlistSelections.update(selections => ({
				...selections,
				target: targetUrl
			}));
		}
	}

	function closeModal() {
		isPlaylistSelectorOpen.set(false);
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeModal();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}

	function logout() {
		spotifyAPI.logout();
		window.location.reload();
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click={handleBackdropClick} on:keydown={handleKeydown}>
	<div class="modal-content">
		<div class="modal-header">
			<h2>Settings</h2>
			<button class="close-btn" on:click={closeModal} aria-label="Close">
				<i class="fas fa-times"></i>
			</button>
		</div>

		<div class="playlist-selector">
			<div class="header">
				<div class="user-info">
					{#if $user}
						{#if $user.images && $user.images.length > 0 && $user.images[0]?.url}
							<img src={$user.images[0].url} alt="Profile" class="profile-pic" />
						{:else}
							<div class="profile-pic profile-pic-fallback">
								{$user.display_name ? $user.display_name.charAt(0).toUpperCase() : 'U'}
							</div>
						{/if}
						<span class="username">{$user.display_name}</span>
					{/if}
				</div>
				<div class="header-controls">
					<ScraperButtons />
					<Settings />
					<button class="logout-btn" on:click={logout} aria-label="Logout" title="Logout">
						<i class="fas fa-sign-out-alt"></i>
					</button>
				</div>
			</div>

			<div class="selectors">
				<div class="selector-group">
					<label for="source-playlist">
						<i class="fas fa-list"></i>
						Source Playlist
					</label>
					<select 
						id="source-playlist" 
						bind:value={selectedId} 
						on:change={handleSelectedPlaylistChange}
					>
						<option value="">Select a playlist to manage</option>
						{#each userPlaylists as playlist}
							<option value={playlist.id} title={playlist.name}>{playlist.name}</option>
						{/each}
					</select>
				</div>

				<div class="selector-group">
					<label for="target-playlist">
						<i class="fas fa-bullseye"></i>
						Target Playlist
					</label>
					<select 
						id="target-playlist" 
						bind:value={targetId} 
						on:change={handleTargetPlaylistChange}
					>
						<option value="">Select destination playlist</option>
						{#each targetPlaylists as playlist}
							<option value={playlist.id} title={playlist.name}>{playlist.name}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: #000000cc;
		backdrop-filter: blur(5px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: #121212f2;
		border-radius: 16px;
		border: 1px solid #ffffff1a;
		width: 100%;
		max-width: 800px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px #00000080;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid #ffffff1a;
	}

	.modal-header h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
		color: #ffffffff;
	}

	.close-btn {
		background: #ffffff1a;
		color: #ffffffff;
		border: 1px solid #ffffff33;
		border-radius: 8px;
		width: 40px;
		height: 40px;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
	}

	.close-btn:hover {
		background: #ffffff33;
		color: #ff6b6bff;
	}

	.playlist-selector {
		background: transparent;
		backdrop-filter: none;
		border-radius: 0;
		padding: 0 1.5rem 1.5rem 1.5rem;
		margin-bottom: 0;
		padding: 1rem;
		border: none;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.profile-pic {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
	}

	.profile-pic-fallback {
		background: linear-gradient(45deg, #1db954ff, #1ed760ff);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: bold;
		font-size: 1.2rem;
		color: #f3f3f3ff;
		text-shadow: 0 1px 2px #00000033;
	}

	.username {
		font-weight: 600;
		font-size: 1.1rem;
	}
	
	.header-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.logout-btn {
		background: #ffffff1a;
		color: #ffffffff;
		border: 1px solid #ffffff33;
		border-radius: 8px;
		cursor: pointer;
		padding-top: 3px;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 34px;
	}

	.logout-btn:hover {
		background: #ffffff33;
	}

	.selectors {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.selector-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
		overflow: hidden;
	}

	.selector-group label {
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #e1e1e1ff;
	}

	select {
		background: #ffffff1a;
		color: #ffffffff;
		border: 1px solid #ffffff33;
		padding: 0.75rem;
		border-radius: 8px;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.3s ease;
		width: 100%;
		max-width: 100%;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	select:hover {
		border-color: #1db954ff;
	}

	select:focus {
		outline: none;
		border-color: #1db954ff;
		box-shadow: 0 0 0 2px #1db95433;
	}

	option {
		background: #2a2a2aff;
		color: #ffffffff;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		max-width: 100%;
	}

	@media (max-width: 768px) {
		.modal-content {
			max-width: 95%;
			max-height: 95vh;
		}

		.modal-header {
			padding: 1rem;
		}

		.playlist-selector {
			padding: 1rem;
		}

		.selectors {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}
	}
</style>
