# Motify - Spotify Playlist Manager

A modern web application built with SvelteKit for managing your Spotify playlists with ease.

## Features

- 🎵 **Spotify Integration**: Connect with your Spotify account
- 📋 **Playlist Management**: View and manage your playlists
- 🎵 **Track Operations**: Play, remove, and transfer tracks between playlists
- 🎮 **Media Controls**: Full playback control with scrubber and track navigation
- 🌙 **Dark Theme**: Beautiful dark interface with glassmorphism design
- 📱 **Responsive**: Works on desktop and mobile devices

## Prerequisites

1. **Spotify Developer Account**: You need to create a Spotify app to get client credentials
2. **Node.js**: Version 18 or higher

## Setup Instructions

### 1. Spotify App Setup

1. Go to [Spotify for Developers](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create App"
4. Fill in the app details:
   - **App Name**: Motify (or any name you prefer)
   - **App Description**: Spotify Playlist Manager
   - **Redirect URI**: `http://127.0.0.1:8181/callback`
   - **API/SDK**: Web API
5. Save the app and note down your **Client ID**

### 2. Application Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   - The project includes a `.env` file with your Spotify app credentials
   - Update the `.env` file with your actual Spotify app details:
   ```env
   PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
   PUBLIC_SPOTIFY_REDIRECT_URI=http://127.0.0.1:8181/callback
   ```
   - **Note**: The `PUBLIC_` prefix makes these variables available to the client-side code
   - **Important**: Use `127.0.0.1` (loopback address) as required by Spotify's security policy
   - **Security**: Never include `SPOTIFY_CLIENT_SECRET` in client-side applications

3. **Update Spotify App Settings**:
   - In your Spotify Developer Dashboard, set the redirect URI to: `http://127.0.0.1:8181/callback`
   - **Important**: Spotify requires loopback addresses (127.0.0.1) for HTTP, not localhost or local network IPs
   - This follows Spotify's updated security requirements as of April 2025

4. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   - The server will start on the IP and port specified in your `.env` file
   - Make sure no other process is using the same port

5. **Open the Application**:
   - Navigate to `http://127.0.0.1:8181/` in your browser
   - Click "Connect with Spotify" to authenticate

## Usage

1. **Authentication**: Click the "Connect with Spotify" button to authorize the app
2. **Select Playlists**: Choose a source playlist to manage and optionally a target playlist
3. **Manage Tracks**: 
   - ▶️ Play any track directly
   - 🗑️ Remove tracks from the current playlist
   - ➡️ Move tracks to the target playlist (if selected)
4. **Playback Control**: Use the player controls to play/pause, skip tracks, and scrub through songs

## Features in Detail

### Playlist Management
- View all your Spotify playlists
- Select source and target playlists
- Real-time track list updates

### Media Player
- Full playback control integration with Spotify
- Progress bar with seek functionality
- Previous/Next track controls
- Real-time playback status

### Track Operations
- **Play**: Start playing any track immediately
- **Remove**: Remove tracks from the current playlist
- **Move**: Transfer tracks from source to target playlist

## Technologies Used

- **SvelteKit**: Full-stack web framework
- **TypeScript**: Type-safe JavaScript
- **Spotify Web API**: Music streaming integration
- **FontAwesome**: Icons and UI elements
- **CSS Grid/Flexbox**: Responsive layouts
- **CSS Backdrop Filter**: Glassmorphism effects

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type checking
npm run check

# Build for production
npm run build

# Preview production build
npm run preview
```

## API Permissions

The app requests the following Spotify scopes:
- `streaming`: Control playback
- `user-read-email`: Read user email
- `user-read-private`: Read user profile
- `user-read-playback-state`: Read current playback
- `user-modify-playback-state`: Control playback
- `playlist-read-private`: Read private playlists
- `playlist-read-collaborative`: Read collaborative playlists
- `playlist-modify-public`: Modify public playlists
- `playlist-modify-private`: Modify private playlists

## Notes

- **Spotify Premium**: Some features require a Spotify Premium account
- **Active Device**: Playback control requires an active Spotify device
- **Rate Limits**: The app respects Spotify's API rate limits

## Deployment

### Netlify Deployment

This app is configured for easy deployment to Netlify:

1. **Configure Spotify App for Production**:
   - In your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), edit your app
   - Add your production domain to the Redirect URIs: `https://your-netlify-domain.netlify.app/callback`
   - Keep the local development URI as well: `http://127.0.0.1:8181/callback`

2. **Set Environment Variables in Netlify**:
   - Go to your Netlify site dashboard
   - Navigate to Site settings → Environment variables
   - Add the following variable:
     ```
     PUBLIC_SPOTIFY_CLIENT_ID = your_spotify_client_id_here
     ```
   - **Note**: You don't need to set `PUBLIC_SPOTIFY_REDIRECT_URI` in production as it's automatically determined from your domain

3. **Deploy**:
   - Connect your GitHub repository to Netlify
   - The build settings are automatically configured via `netlify.toml`
   - Build command: `npm run build`
   - Publish directory: `build`

The app will automatically detect the environment and use the correct redirect URI for authentication.

## Troubleshooting

1. **Authentication Issues**: 
   - Ensure your Spotify app's redirect URI is exactly: `http://127.0.0.1:8181/callback`
   - Check that `PUBLIC_SPOTIFY_CLIENT_ID` is set correctly in your `.env` file
   - Verify your Spotify app is properly configured in the developer dashboard
   - **Important**: Use `127.0.0.1` not `localhost` - Spotify's new security requirements

2. **Port/Network Issues**:
   - If port 8181 is already in use, check with `lsof -i :8181`
   - Kill conflicting processes or change the port in both `.env` and `vite.config.ts`
   - The app must run on the same port as configured in your Spotify app

3. **Spotify Security Errors**:
   - "INVALID_CLIENT: Insecure redirect URI" means you need to use `127.0.0.1` not local network IPs
   - Spotify enforces HTTPS for non-loopback addresses, HTTP only allowed for `127.0.0.1`
   - Update your Spotify app redirect URI to match exactly: `http://127.0.0.1:8181/callback`

4. **Environment Variables Not Loading**:
   - Make sure your `.env` file is in the project root directory
   - Restart the development server after changing environment variables
   - Ensure variable names start with `PUBLIC_` for client-side access

5. **Playback Issues**: 
   - Make sure you have an active Spotify device (mobile app, desktop app, or web player)
   - Spotify Premium is required for playback control features

6. **Missing Tracks**: Some tracks may not be available due to regional restrictions or licensing

## License

This project is licensed under the MIT License - see the LICENSE file for details.
