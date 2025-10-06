<script lang="ts">
	import { onMount } from 'svelte';
	import { user, playlists, selectedPlaylist, targetPlaylist, isPlaylistSelectorOpen } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import type { SpotifyPlaylist } from '$lib/spotify';
	import Settings from './Settings.svelte';
	import ScraperButtons from './ScraperButtons.svelte';

	let userPlaylists: SpotifyPlaylist[] = [];
	let selectedId = '';
	let targetId = '';

	$: userPlaylists = $playlists;

	onMount(async () => {
		try {
			const userInfo = await spotifyAPI.getCurrentUser();
			user.set(userInfo);

			const playlistsData = await spotifyAPI.getUserPlaylists();
			playlists.set(playlistsData);
		} catch (error) {
			console.error('Failed to load user data:', error);
		}
	});

	function handleSelectedPlaylistChange() {
		const playlist = userPlaylists.find(p => p.id === selectedId);
		selectedPlaylist.set(playlist || null);
	}

	function handleTargetPlaylistChange() {
		const playlist = userPlaylists.find(p => p.id === targetId);
		targetPlaylist.set(playlist || null);
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
			<h2>Playlist Manager</h2>
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
						{#each userPlaylists as playlist}
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
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(5px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: rgba(18, 18, 18, 0.95);
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		width: 100%;
		max-width: 800px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.modal-header h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
		color: #ffffff;
	}

	.close-btn {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		border: 1px solid rgba(255, 255, 255, 0.2);
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
		background: rgba(255, 255, 255, 0.2);
		color: #ff6b6b;
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
		background: linear-gradient(45deg, #1db954, #1ed760);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: bold;
		font-size: 1.2rem;
		color: white;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
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
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		border: 1px solid rgba(255, 255, 255, 0.2);
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
		background: rgba(255, 255, 255, 0.2);
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
		min-width: 0; /* Allow flex items to shrink below content size */
		overflow: hidden; /* Prevent content from breaking out */
	}

	.selector-group label {
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #e1e1e1;
	}

	select {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		border: 1px solid rgba(255, 255, 255, 0.2);
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
		border-color: #1db954;
	}

	select:focus {
		outline: none;
		border-color: #1db954;
		box-shadow: 0 0 0 2px rgba(29, 185, 84, 0.2);
	}

	option {
		background: #2a2a2a;
		color: #ffffff;
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
