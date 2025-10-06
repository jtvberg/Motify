<script lang="ts">
	import { spotifyAPI } from '$lib/spotify';

	async function login() {
		try {
			const authUrl = await spotifyAPI.getAuthUrl();
			console.log('Auth URL:', authUrl);

			console.log('Environment check:', {
				hasClientId: !!authUrl.includes('client_id='),
				hasRedirectUri: !!authUrl.includes('redirect_uri='),
				fullUrl: authUrl
			});
			
			if (!authUrl.includes('client_id=') || authUrl.includes('client_id=&')) {
				console.error('Missing Spotify Client ID - check your .env file');
				alert('Configuration error: Missing Spotify Client ID. Check console for details.');
				return;
			}
			
			window.location.href = authUrl;
		} catch (error) {
			console.error('Failed to generate auth URL:', error);
			alert('Failed to generate authentication URL. Check console for details.');
		}
	}
</script>

<div class="auth-container">
	<div class="auth-card">
		<div class="auth-header">
			<i class="fab fa-spotify fa-4x"></i>
			<h1>Motify</h1>
			<p>Your Spotify Playlist Manager</p>
		</div>

		<div class="auth-content">
			<p>Connect your Spotify account to manage your playlists</p>
			<button class="auth-button" on:click={login}>
				<i class="fab fa-spotify"></i>
				Connect with Spotify
			</button>
		</div>
	</div>
</div>

<style>
	.auth-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		padding: 2rem;
	}

	.auth-card {
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
		border-radius: 16px;
		padding: 3rem;
		text-align: center;
		max-width: 400px;
		width: 100%;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.auth-header h1 {
		font-size: 2.5rem;
		margin: 1rem 0 0.5rem 0;
		background: linear-gradient(45deg, #1db954, #1ed760);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.auth-header p {
		color: #b3b3b3;
		margin-bottom: 2rem;
	}

	.auth-content p {
		margin-bottom: 2rem;
		color: #e1e1e1;
	}

	.auth-button {
		background: #1db954;
		color: #f3f3f3;
		border: none;
		padding: 1rem 2rem;
		border-radius: 50px;
		font-size: 1.1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.auth-button:hover {
		background: #1ed760;
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(29, 185, 84, 0.3);
	}

	.fa-spotify {
		color: #1db954;
	}
</style>
