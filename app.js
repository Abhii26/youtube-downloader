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
        } else {
            filename = `${videoTitle}.mp4`;
            contentType = 'video/mp4';
            
            // Map quality to youtube-dl format codes
            let formatCode;
            switch (quality) {
                case '480p':
                    formatCode = 'bestvideo[height<=480]+bestaudio/best[height<=480]';
                    break;
                case '720p':
                    formatCode = 'bestvideo[height<=720]+bestaudio/best[height<=720]';
                    break;
                case '1080p':
                    formatCode = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
                    break;
                default:
                    formatCode = 'bestvideo+bestaudio/best';
            }

            downloadOptions = {
                format: formatCode,
                mergeOutputFormat: 'mp4',
                output: '-' // Stream to stdout
            };
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', contentType);

        // Stream the download
        try {
            const download = youtubedl.exec(url, downloadOptions);

            download.stdout.pipe(res);

            download.on('error', (err) => {
                console.error('Download error:', err);
                if (!res.headersSent) {
                    res.render('index', { error: 'Error during download' });
                }
            });

            download.on('end', () => {
                if (!res.headersSent) {
                    res.end();
                }
            });

        } catch (streamErr) {
            console.error('Stream setup error:', streamErr);
            if (!res.headersSent) {
                res.render('index', { error: 'Failed to start download' });
            }
        }

    } catch (error) {
        console.error('General error:', error);
        if (!res.headersSent) {
            res.render('index', { error: 'An unexpected error occurred' });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});