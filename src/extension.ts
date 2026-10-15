import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';



export function activate(context: vscode.ExtensionContext) {
    console.log('Video Autoplay extension is now active!');

    let disposablePlay = vscode.commands.registerCommand('videoAutoplay.play', async (uri?: vscode.Uri) => {
        let videoFiles: string[] = [];
        let startFile: string | undefined;

        if (uri) {
            const dir = path.dirname(uri.fsPath);
            startFile = uri.fsPath;
            videoFiles = await findVideoFiles(dir, false); 
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
            const rootPath = workspaceFolders[0].uri.fsPath;
            videoFiles = await findVideoFiles(rootPath, true);
        }

        playVideoArray(videoFiles, startFile, uri);
    });

    context.subscriptions.push(disposablePlay);

    function playVideoArray(videoFiles: string[], startFile?: string, uri?: vscode.Uri) {
        if (videoFiles.length === 0) {
            vscode.window.showInformationMessage('No video files found.');
            return;
        }

        let currentIndex = 0;
        if (startFile) {
            const index = videoFiles.indexOf(startFile);
            if (index !== -1) {
                currentIndex = index;
            }
        }

        const rootDir = uri ? path.dirname(uri.fsPath) : (vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '');
        
        const panel = vscode.window.createWebviewPanel(
            'videoPlayer',
            videoFiles.length > 1 ? 'Video Player' : path.basename(videoFiles[0]),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(rootDir), vscode.Uri.file(path.dirname(rootDir))]
            }
        );

        // Set initial HTML once
        panel.webview.html = getWebviewContent();

        function playCurrentVideo() {
            if (currentIndex >= videoFiles.length) {
                panel.webview.postMessage({ command: 'end' });
                return;
            }

            const videoPath = videoFiles[currentIndex];
            const videoUri = panel.webview.asWebviewUri(vscode.Uri.file(videoPath)).toString();
            const fileName = path.basename(videoPath);
            
            // Highlight/Reveal file in Explorer
            vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(videoPath));

            panel.webview.postMessage({
                command: 'play',
                uri: videoUri,
                title: fileName,
                current: currentIndex + 1,
                total: videoFiles.length
            });
        }

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'next':
                        if (currentIndex < videoFiles.length - 1) {
                            currentIndex++;
                            playCurrentVideo();
                        }
                        break;
                    case 'previous':
                        if (currentIndex > 0) {
                            currentIndex--;
                            playCurrentVideo();
                        }
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(`Error playing video: ${message.text}`);
                        break;
                    case 'ready':
                        playCurrentVideo();
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    }
}

// Find video files
async function findVideoFiles(dir: string, recursive: boolean): Promise<string[]> {
    let results: string[] = [];
    try {
        const list = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const dirent of list) {
            const res = path.resolve(dir, dirent.name);
            if (dirent.isDirectory()) {
                if (recursive) {
                    if (dirent.name === 'node_modules' || dirent.name === '.git' || dirent.name.startsWith('.')) {
                        continue;
                    }
                    const subResults = await findVideoFiles(res, true);
                    results = results.concat(subResults);
                }
            } else {
                const ext = path.extname(res).toLowerCase();
                if (['.mp4', '.mkv', '.mov', '.webm', '.avi'].includes(ext)) {
                    results.push(res);
                }
            }
        }
    } catch (e) {
        console.error(`Error reading directory ${dir}:`, e);
    }
    return results.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Video Player</title>
    <style>
        body { 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0; 
            background-color: #1e1e1e;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
        }
        video {
            max-width: 100%;
            max-height: 75vh;
            outline: none;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            background: #000;
        }
        .controls {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            margin-top: 20px;
            width: 90%;
            max-width: 800px;
            background: rgba(45, 45, 45, 0.9);
            padding: 15px 25px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            box-sizing: border-box;
        }
        button {
            background: #007acc;
            border: none;
            color: #fff;
            padding: 10px 20px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 1em;
            font-weight: 500;
            transition: background 0.2s;
            min-width: 100px;
        }
        button:hover:not(:disabled) {
            background: #005999;
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: #007acc;
        }
        .info {
            text-align: center;
            flex-grow: 1;
        }
        #title {
            margin: 0;
            font-size: 1.1em;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 400px;
            margin: 0 auto;
        }
        #counter {
            margin: 5px 0 0 0;
            font-size: 0.9em;
            color: #bbb;
        }
        #playerContainer {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            height: 100%;
            justify-content: center;
        }
        #endScreen {
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
        }
        #interactionOverlay {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            display: none; /* hidden by default */
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            cursor: pointer;
            backdrop-filter: blur(5px);
        }
        #interactionOverlay h2 {
            font-size: 2em;
            margin-bottom: 10px;
        }
        #interactionOverlay p {
            font-size: 1.2em;
            color: #ddd;
        }
    </style>
</head>
<body>
    <div id="interactionOverlay">
        <h2>Click anywhere to play</h2>
        <p>Browser policy requires an interaction to play videos with sound.</p>
    </div>

    <div id="playerContainer">
        <video id="player" controls autoplay>
            <!-- Source will be set by JS -->
            Your browser does not support the video tag.
        </video>
        <div class="controls">
            <button id="prevBtn" title="Keyboard Shortcut: Left Arrow / P">Previous</button>
            <div class="info">
                <h3 id="title">Loading...</h3>
                <p id="counter"></p>
            </div>
            <button id="nextBtn" title="Keyboard Shortcut: Right Arrow / N">Next</button>
        </div>
    </div>
    
    <div id="endScreen">
        <h1>All videos have been played!</h1>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const player = document.getElementById('player');
        const titleElem = document.getElementById('title');
        const counterElem = document.getElementById('counter');
        const playerContainer = document.getElementById('playerContainer');
        const endScreen = document.getElementById('endScreen');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const interactionOverlay = document.getElementById('interactionOverlay');

        let pendingPlayMessage = null;

        // Notify extension we are ready to receive the first video
        vscode.postMessage({ command: 'ready' });

        prevBtn.onclick = () => {
            vscode.postMessage({ command: 'previous' });
        };

        nextBtn.onclick = () => {
            vscode.postMessage({ command: 'next' });
        };

        interactionOverlay.onclick = () => {
            interactionOverlay.style.display = 'none';
            if (pendingPlayMessage) {
                playVideoData(pendingPlayMessage);
            } else {
                player.play();
            }
        };

        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
                vscode.postMessage({ command: 'next' });
            } else if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') {
                vscode.postMessage({ command: 'previous' });
            } else if (e.key === ' ' && e.target === document.body) {
                if (player.paused) player.play();
                else player.pause();
                e.preventDefault();
            }
        });

        function playVideoData(message) {
            playerContainer.style.display = 'flex';
            endScreen.style.display = 'none';
            interactionOverlay.style.display = 'none';
            
            player.src = message.uri;
            titleElem.textContent = message.title;
            
            // Always show controls
            prevBtn.style.display = 'block';
            nextBtn.style.display = 'block';
            counterElem.style.display = 'block';
            document.querySelector('.controls').style.justifyContent = 'space-between';
            
            counterElem.textContent = \`\${message.current} / \${message.total}\`;
            
            if (message.total === 1) {
                prevBtn.disabled = true;
                nextBtn.disabled = true;
            } else {
                prevBtn.disabled = message.current === 1;
                nextBtn.disabled = message.current === message.total;
            }
            
            player.play().catch(e => {
                console.error('Autoplay failed:', e);
                // If it fails due to no user interaction, show the overlay!
                if (e.name === 'NotAllowedError') {
                    pendingPlayMessage = message;
                    playerContainer.style.display = 'none';
                    interactionOverlay.style.display = 'flex';
                }
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'play':
                    playVideoData(message);
                    break;
                    
                case 'end':
                    playerContainer.style.display = 'none';
                    endScreen.style.display = 'flex';
                    interactionOverlay.style.display = 'none';
                    player.pause();
                    player.src = "";
                    break;
            }
        });

        player.onended = () => {
            console.log('Video ended, requesting next...');
            vscode.postMessage({ command: 'next' });
        };

        player.onerror = (e) => {
            console.error('Video error', e);
            vscode.postMessage({ command: 'error', text: 'Playback failed' });
        };
    </script>
</body>
</html>`;
}

export function deactivate() {}

