import { json } from '@sveltejs/kit';

export const GET = async ({ url }: { url: URL }) => {
	const playlistId = url.searchParams.get('id');
	
	if (!playlistId) {
		return json({ error: 'Playlist ID is required' }, { status: 400 });
	}

	try {
		const everynoiseUrl = `https://everynoise.com/playlistprofile.cgi?id=${playlistId}`;
		const response = await fetch(everynoiseUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
			}
		});

		if (!response.ok) {
			return json({ error: `HTTP error! status: ${response.status}` }, { status: response.status });
		}

		const html = await response.text();
		const trackIds: string[] = [];
		const apihMatch = html.match(/var apiheader = "(.*?)"/);
		let apiToken = '';
		
		if (apihMatch) {
			const authMatch = apihMatch[1].match(/Bearer ([^']+)/);
			if (authMatch) {
				apiToken = authMatch[1];
				console.log('Found API token:', apiToken.substring(0, 20) + '...');
			}
		}
		
		if (apiToken) {
			try {
				const spotifyResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
					headers: {
						'Authorization': `Bearer ${apiToken}`
					}
				});
				
				if (spotifyResponse.ok) {
					const spotifyData = await spotifyResponse.json();
					console.log('Got Spotify data:', spotifyData.items?.length, 'tracks');
					
					if (spotifyData.items) {
						spotifyData.items.forEach((item: any) => {
							if (item.track && item.track.id) {
								trackIds.push(item.track.id);
							}
						});
					}
				} else {
					console.log('Spotify API call failed:', spotifyResponse.status);
				}
			} catch (spotifyError) {
				console.log('Error calling Spotify API:', spotifyError);
			}
		}
		
		if (trackIds.length === 0) {
			const spotifyTrackMatches = html.match(/[0-9A-Za-z]{22}/g);
			if (spotifyTrackMatches) {
				console.log('Found potential Spotify IDs:', spotifyTrackMatches.slice(0, 10));
				const validSpotifyIds = spotifyTrackMatches.filter(id => 
					id.length === 22 && 
					/^[0-9A-Za-z]{22}$/.test(id) && 
					id !== playlistId &&
					!id.startsWith('BQ')
				);
				trackIds.push(...validSpotifyIds);
			}
		}

		return json({ 
			trackIds: [...new Set(trackIds)],
			htmlLength: html.length,
			foundToken: !!apiToken,
			method: trackIds.length > 0 ? (apiToken ? 'spotify-api' : 'html-parsing') : 'none'
		});

	} catch (error) {
		console.error('Error scraping everynoise:', error);
		return json({ error: 'Failed to scrape everynoise data' }, { status: 500 });
	}
};
