const express = require('express');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const app = express();

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

        // Set download headers and options
        let filename;
        let contentType;
        let downloadOptions = {};

        if (format === 'mp3') {
            filename = `${videoTitle}.mp3`;
            contentType = 'audio/mpeg';
            downloadOptions = {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0, // Best audio quality
                output: '-' // Stream to stdout
            };
            console.log('MP3 options:', downloadOptions);
        } else if (format === 'mp4') {
            filename = `${videoTitle}.mp4`;
            contentType = 'video/mp4';

            // Specific format codes for reliable video+audio
            let formatCode;
            switch (quality) {
                case '480p':
                    formatCode = '18'; // 480p MP4 (H.264, AAC)
                    break;
                case '720p':
                    formatCode = '22'; // 720p MP4 (H.264, AAC)
                    break;
                case '1080p':
                    formatCode = '137+140'; // 1080p video (H.264) + audio (AAC)
                    break;
                default:
                    formatCode = 'bestvideo+bestaudio'; // Fallback
            }

            downloadOptions = {
                format: formatCode,
                mergeOutputFormat: 'mp4', // Ensure merged output is MP4
                output: '-', // Stream to stdout
                recodeVideo: 'mp4', // Force MP4 encoding if needed
                noCheckCertificates: true // Handle potential SSL issues
            };
            console.log('MP4 options:', downloadOptions);
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', contentType);

        // Stream the download
        try {
            const download = youtubedl.exec(url, downloadOptions);

            download.stdout.on('data', () => {
                console.log('Streaming data...');
            });

            download.stdout.pipe(res);

            download.on('error', (err) => {
                console.error('Download error:', err.message);
                if (!res.headersSent) {
                    res.render('index', { error: 'Error during download: ' + err.message });
                }
            });

            download.on('end', () => {
                console.log('Download completed');
                if (!res.headersSent) {
                    res.end();
                }
            });

        } catch (streamErr) {
            console.error('Stream setup error:', streamErr.message);
            if (!res.headersSent) {
                res.render('index', { error: 'Failed to start download: ' + streamErr.message });
            }
        }

    } catch (error) {
        console.error('General error:', error.message);
        if (!res.headersSent) {
            res.render('index', { error: 'An unexpected error occurred: ' + error.message });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});