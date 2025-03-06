const express = require('express');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const app = express();

const unlinkAsync = promisify(fs.unlink);

// Set up EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Home route
app.get('/', (req, res) => {
    res.render('index', { error: null });
});

// Download route
app.post('/download', async (req, res) => {
    try {
        const { url, format, quality } = req.body;
        console.log(`Request: URL=${url}, Format=${format}, Quality=${quality}`);

        // Basic URL validation
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
            return res.render('index', { error: 'Invalid YouTube URL' });
        }

        // Get video info
        let info;
        try {
            info = await youtubedl(url, {
                dumpSingleJson: true,
                noWarnings: true,
            });
            console.log('Video info fetched:', info.title);
        } catch (err) {
            console.error('Info fetch failed:', err.message);
            return res.render('index', { error: 'Failed to fetch video information' });
        }

        const videoTitle = info.title.replace(/[^\w\s]/gi, '');
        let filename;
        let contentType;
        let downloadOptions = {};

        if (format === 'mp3') {
            filename = `${videoTitle}.mp3`;
            contentType = 'audio/mpeg';
            downloadOptions = {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0,
                output: '-'
            };
            console.log('MP3 options:', downloadOptions);

            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', contentType);

            const download = youtubedl.exec(url, downloadOptions);
            download.stdout.pipe(res);

            download.on('error', (err) => {
                console.error('MP3 Download error:', err.message);
                if (!res.headersSent) {
                    res.render('index', { error: 'Error during MP3 download: ' + err.message });
                }
            });
            download.on('end', () => console.log('MP3 Download completed'));
        } else if (format === 'mp4') {
            filename = `${videoTitle}.mp4`;
            contentType = 'video/mp4';

            // Temporary file for 1080p or fallback merging
            const tempFile = path.join(__dirname, `${videoTitle}-${Date.now()}.mp4`);

            // Get available formats
            const formats = info.formats;
            let formatCode;

            switch (quality) {
                case '480p':
                    formatCode = formats.find(f => f.format_id === '18') ? '18' : 'bestvideo[height<=480]+bestaudio/best[height<=480]';
                    downloadOptions = {
                        format: formatCode,
                        mergeOutputFormat: 'mp4',
                        output: formatCode === '18' ? '-' : tempFile // Stream if pre-merged, otherwise merge to file
                    };
                    break;
                case '720p':
                    formatCode = formats.find(f => f.format_id === '22') ? '22' : 'bestvideo[height<=720]+bestaudio/best[height<=720]';
                    downloadOptions = {
                        format: formatCode,
                        mergeOutputFormat: 'mp4',
                        output: formatCode === '22' ? '-' : tempFile // Stream if pre-merged, otherwise merge to file
                    };
                    break;
                case '1080p':
                    formatCode = '137+140'; // 1080p video + audio
                    downloadOptions = {
                        format: formatCode,
                        mergeOutputFormat: 'mp4',
                        output: tempFile // Always merge to file for 1080p
                    };
                    break;
                default:
                    formatCode = 'bestvideo+bestaudio';
                    downloadOptions = {
                        format: formatCode,
                        mergeOutputFormat: 'mp4',
                        output: '-'
                    };
            }
            console.log('MP4 options:', downloadOptions);

            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', contentType);

            try {
                if (downloadOptions.output === '-') {
                    // Direct streaming for pre-merged formats (480p '18', 720p '22')
                    const download = youtubedl.exec(url, downloadOptions);
                    download.stdout.pipe(res);

                    download.on('error', (err) => {
                        console.error('MP4 Download error:', err.message);
                        if (!res.headersSent) {
                            res.render('index', { error: `Error during MP4 download (${quality}): ${err.message}` });
                        }
                    });
                    download.on('end', () => {
                        console.log('MP4 Download completed');
                        if (!res.headersSent) res.end();
                    });
                } else {
                    // Download to temp file and stream for merging cases
                    await youtubedl(url, downloadOptions);
                    console.log(`${quality} file created at:`, tempFile);

                    const readStream = fs.createReadStream(tempFile);
                    readStream.pipe(res);

                    readStream.on('error', (err) => {
                        console.error('Read stream error:', err.message);
                        if (!res.headersSent) {
                            res.render('index', { error: `Error streaming ${quality}: ${err.message}` });
                        }
                    });

                    readStream.on('end', async () => {
                        console.log(`${quality} streaming completed`);
                        try {
                            await unlinkAsync(tempFile);
                            console.log('Temp file deleted');
                            if (!res.headersSent) res.end();
                        } catch (cleanupErr) {
                            console.error('Cleanup error:', cleanupErr.message);
                        }
                    });
                }
            } catch (streamErr) {
                console.error('Stream setup error:', streamErr.message);
                if (!res.headersSent) {
                    res.render('index', { error: `Failed to start ${quality} download: ${streamErr.message}` });
                }
            }
        }
    } catch (error) {
        console.error('General error:', error.message);
        if (!res.headersSent) {
            res.render('index', { error: 'An unexpected error occurred: ' + error.message });
        }
    }
});

const PORT = process.env.PORT  || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});