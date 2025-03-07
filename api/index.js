const express = require('express');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const app = express();
const unlinkAsync = promisify(fs.unlink);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views')); // Adjusted for api/ folder
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));

// Root route to render the form
app.get('/', (req, res) => {
    res.render('index', { error: null });
});

// Download route
app.post('/download', async (req, res) => {
    try {
        const { url, format, quality } = req.body;
        console.log(`Request: URL=${url}, Format=${format}, Quality=${quality}`);

        if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
            return res.render('index', { error: 'Invalid YouTube URL' });
        }

        let info;
        try {
            info = await youtubedl(url, { dumpSingleJson: true, noWarnings: true });
            console.log('Video info fetched:', info.title);
        } catch (err) {
            console.error('Info fetch failed:', err.message);
            return res.render('index', { error: 'Failed to fetch video information' });
        }

        const videoTitle = info.title.replace(/[^\w\s]/gi, '');
        let filename = format === 'mp3' ? `${videoTitle}.mp3` : `${videoTitle}.mp4`;
        let contentType = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';
        let downloadOptions = {};

        if (format === 'mp3') {
            downloadOptions = {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0,
                output: '-'
            };
        } else {
            const formats = info.formats;
            let formatCode;
            switch (quality) {
                case '480p':
                    formatCode = formats.find(f => f.format_id === '18') ? '18' : 'bestvideo[height<=480]+bestaudio/best[height<=480]';
                    break;
                case '720p':
                    formatCode = formats.find(f => f.format_id === '22') ? '22' : 'bestvideo[height<=720]+bestaudio/best[height<=720]';
                    break;
                case '1080p':
                    formatCode = '137+140';
                    break;
                default:
                    formatCode = 'bestvideo+bestaudio';
            }
            downloadOptions = {
                format: formatCode,
                mergeOutputFormat: 'mp4',
                output: formatCode === '18' || formatCode === '22' ? '-' : path.join(__dirname, `${videoTitle}.mp4`)
            };
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', contentType);

        if (downloadOptions.output === '-') {
            const download = youtubedl.exec(url, downloadOptions);
            download.stdout.pipe(res);
            download.on('error', (err) => {
                console.error('Download error:', err.message);
                if (!res.headersSent) res.render('index', { error: 'Download error: ' + err.message });
            });
        } else {
            await youtubedl(url, downloadOptions);
            const readStream = fs.createReadStream(downloadOptions.output);
            readStream.pipe(res);
            readStream.on('end', async () => {
                await unlinkAsync(downloadOptions.output);
                if (!res.headersSent) res.end();
            });
        }
    } catch (error) {
        console.error('General error:', error.message);
        if (!res.headersSent) res.render('index', { error: 'Unexpected error: ' + error.message });
    }
});

// Export for Vercel serverless
module.exports = app;