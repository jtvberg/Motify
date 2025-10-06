<script lang="ts">
	import { scraperSettings } from '$lib/stores';
	import { extractPlaylistIdFromUrl, isValidSpotifyPlaylistId } from '$lib/utils';
	
	let showSettings = false;
	let discoverWeeklyUrl = '';
	let releaseRadarUrl = '';
	let modalElement: HTMLDivElement;
	
	$: {
		discoverWeeklyUrl = $scraperSettings.discoverWeeklyUrl;
		releaseRadarUrl = $scraperSettings.releaseRadarUrl;
	}
	
	function toggleSettings() {
		showSettings = !showSettings;
	}
	
	function saveSettings() {
		scraperSettings.set({
			discoverWeeklyUrl: discoverWeeklyUrl.trim(),
			releaseRadarUrl: releaseRadarUrl.trim()
		});
		showSettings = false;
	}
	
	function cancelSettings() {
		discoverWeeklyUrl = $scraperSettings.discoverWeeklyUrl;
		releaseRadarUrl = $scraperSettings.releaseRadarUrl;
		showSettings = false;
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			cancelSettings();
		}
	}
	
	function handleModalClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			cancelSettings();
		}
	}
	
	function portal(node: HTMLElement) {
		let target = document.body;
		
		function update() {
			if (showSettings) {
				target.appendChild(node);
				setTimeout(() => node.focus(), 0);
			} else if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		}
		
		update();
		
		return {
			update,
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}
	
	$: discoverWeeklyValid = !discoverWeeklyUrl || isValidSpotifyPlaylistId(extractPlaylistIdFromUrl(discoverWeeklyUrl));
	$: releaseRadarValid = !releaseRadarUrl || isValidSpotifyPlaylistId(extractPlaylistIdFromUrl(releaseRadarUrl));
	$: allValid = discoverWeeklyValid && releaseRadarValid;
</script>

<div class="settings-container">
	<button class="settings-btn" on:click={toggleSettings} aria-label="Scraper Settings" title="Scraper Settings">
		<i class="fas fa-cog glyph-adj"></i>
	</button>
</div>

{#if showSettings}
	<div 
		class="settings-modal" 
		use:portal 
		bind:this={modalElement}
		on:click={handleModalClick}
		on:keydown={handleKeydown}
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-labelledby="settings-title"
	>
		<div class="settings-content">
			<div class="settings-header">
				<h3 id="settings-title">EveryNoise Scraper Settings</h3>
				<button class="close-btn" on:click={cancelSettings} aria-label="Close settings">
					<i class="fas fa-times"></i>
				</button>
			</div>
			
			<div class="settings-body">
				<p class="settings-description">
					Enter the Spotify URLs for your Discover Weekly and Release Radar playlists. 
					These are personal playlists that update automatically and can't be accessed through the normal API.
				</p>
				
				<div class="input-group">
					<label for="discover-weekly">
						<i class="fas fa-compass"></i>
						Discover Weekly URL
					</label>
					<input 
						id="discover-weekly"
						type="url" 
						bind:value={discoverWeeklyUrl}
						placeholder="https://open.spotify.com/playlist/37i9dQZEVXcQ9BlMOo4hbb?si=..."
						class:invalid={!discoverWeeklyValid}
					/>
					{#if !discoverWeeklyValid}
						<span class="error-text">Invalid Spotify playlist URL</span>
					{/if}
				</div>
				
				<div class="input-group">
					<label for="release-radar">
						<i class="fas fa-satellite-dish"></i>
						Release Radar URL
					</label>
					<input 
						id="release-radar"
						type="url" 
						bind:value={releaseRadarUrl}
						placeholder="https://open.spotify.com/playlist/37i9dQZEVXcQ9BlMOo4hbb?si=..."
						class:invalid={!releaseRadarValid}
					/>
					{#if !releaseRadarValid}
						<span class="error-text">Invalid Spotify playlist URL</span>
					{/if}
				</div>
				
				<div class="help-text">
					<strong>How to get these URLs:</strong>
					<ol>
						<li>Open Spotify and find your Discover Weekly or Release Radar playlist</li>
						<li>Click the three dots (...) menu</li>
						<li>Select "Share" → "Copy link to playlist"</li>
						<li>Paste the URL here</li>
					</ol>
				</div>
			</div>
			
			<div class="settings-footer">
				<button class="cancel-btn" on:click={cancelSettings}>Cancel</button>
				<button class="save-btn" on:click={saveSettings} disabled={!allValid}>
					Save Settings
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.settings-container {
		position: relative;
	}
	
	.settings-btn {
		background: #ffffff1a;
		color: #ffffffff;
		border: 1px solid #ffffff33;
		padding: 0.5rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 34px;
		width: 34px;
	}
	
	.settings-btn:hover {
		background: #ffffff33;
		transform: rotate(90deg);
	}
	
	.settings-modal {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: #000000cc;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
	}
	
	.settings-content {
		background: #2a2a2aff;
		border-radius: 12px;
		max-width: 600px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		border: 1px solid #ffffff1a;
	}
	
	.settings-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid #ffffff1a;
	}
	
	.settings-header h3 {
		margin: 0;
		color: #1db954ff;
		font-size: 1.3rem;
	}
	
	.close-btn {
		background: none;
		border: none;
		color: #ffffffff;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 4px;
		transition: background 0.2s ease;
	}
	
	.close-btn:hover {
		background: #ffffff1a;
	}
	
	.settings-body {
		padding: 1.5rem;
	}
	
	.settings-description {
		color: #b3b3b3ff;
		margin-bottom: 1.5rem;
		line-height: 1.5;
	}
	
	.input-group {
		margin-bottom: 1.5rem;
	}
	
	.input-group label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: #e1e1e1ff;
		margin-bottom: 0.5rem;
	}
	
	.input-group input {
		width: 100%;
		padding: 0.75rem;
		background: #ffffff1a;
		border: 1px solid #ffffff33;
		border-radius: 8px;
		color: #ffffffff;
		font-size: 1rem;
		transition: border-color 0.3s ease;
	}
	
	.input-group input:focus {
		outline: none;
		border-color: #1db954ff;
		box-shadow: 0 0 0 2px #1db95433;
	}
	
	.input-group input.invalid {
		border-color: #e22134ff;
		box-shadow: 0 0 0 2px #e2213433;
	}
	
	.error-text {
		color: #e22134ff;
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}
	
	.help-text {
		background: #1db9541a;
		border: 1px solid #1db9544d;
		border-radius: 8px;
		padding: 1rem;
		color: #b3b3b3ff;
		font-size: 0.9rem;
		line-height: 1.4;
	}
	
	.help-text strong {
		color: #1db954ff;
	}
	
	.help-text ol {
		margin: 0.5rem 0 0 0;
		padding-left: 1.2rem;
	}
	
	.help-text li {
		margin-bottom: 0.3rem;
	}
	
	.settings-footer {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		padding: 1.5rem;
		border-top: 1px solid #ffffff1a;
	}
	
	.cancel-btn, .save-btn {
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		border: none;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.3s ease;
	}
	
	.cancel-btn {
		background: #ffffff1a;
		color: #ffffffff;
	}
	
	.cancel-btn:hover {
		background: #ffffff33;
	}
	
	.save-btn {
		background: #1db954ff;
		color: #ffffffff;
	}
	
	.save-btn:hover:not(:disabled) {
		background: #1ed760ff;
	}
	
	.save-btn:disabled {
		background: #666666ff;
		cursor: not-allowed;
		opacity: 0.6;
	}

	.glyph-adj {
		padding-top: 2px;
	}
</style>
