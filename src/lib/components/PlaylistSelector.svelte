<script lang="ts">
	import { onMount } from 'svelte';
	import { user, playlists, selectedPlaylist, targetPlaylist } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import type { SpotifyPlaylist } from '$lib/spotify';

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

	function logout() {
		spotifyAPI.logout();
		window.location.reload();
	}
</script>

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
		<button class="logout-btn" on:click={logout}>
			<i class="fas fa-sign-out-alt"></i>
			Logout
		</button>
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

<style>
	.playlist-selector {
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(10px);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
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

	.logout-btn {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0.5rem 1rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
