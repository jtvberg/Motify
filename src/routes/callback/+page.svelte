<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { spotifyAPI } from '$lib/spotify';
	import { initializationService } from '$lib/initializationService';

	onMount(async () => {
		console.log('Callback page loaded');

		const urlParams = new URLSearchParams(window.location.search);
		const code = urlParams.get('code');
		const error = urlParams.get('error');
		const errorDescription = urlParams.get('error_description');

		if (error) {
			console.error('Spotify auth error:', { error, errorDescription });
			alert(`Spotify authentication failed: ${error}\n${errorDescription || ''}`);
			goto('/');
			return;
		}

		if (code) {
			try {
				console.log('Exchanging authorization code for access token');
				const accessToken = await spotifyAPI.exchangeCodeForToken(code);
				console.log('Access token received, handling authentication');
				
				await initializationService.handleAuthentication(accessToken);
				
				goto('/');
			} catch (exchangeError) {
				console.error('Token exchange failed:', exchangeError);
				alert(`Token exchange failed: ${exchangeError}`);
				goto('/');
			}
		} else {
			console.error('No authorization code received');
			alert('No authorization code received from Spotify');
			goto('/');
		}
	});
</script>

<div class="callback-container">
	<div class="loading">
		<i class="fas fa-spinner fa-spin fa-2x"></i>
		<p>Authenticating with Spotify...</p>
	</div>
</div>

<style>
	.callback-container {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100vh;
	}

	.loading {
		text-align: center;
	}

	.loading p {
		margin-top: 1rem;
		font-size: 1.2rem;
	}
</style>
