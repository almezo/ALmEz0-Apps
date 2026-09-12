import os

search_code = """
// ==========================================
// SEARCH LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const searchLiveCats = document.getElementById('searchLiveCategories');
    if (searchLiveCats) {
        searchLiveCats.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#liveCategories .list-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                el.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    const searchVodCats = document.getElementById('searchVodCategories');
    if (searchVodCats) {
        searchVodCats.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#vodCategories .list-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                el.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    const searchLiveItems = document.getElementById('searchLiveItems');
    if (searchLiveItems) {
        searchLiveItems.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#liveChannels .list-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                el.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    const searchVodItems = document.getElementById('searchVodItems');
    if (searchVodItems) {
        searchVodItems.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#vodGrid .vod-card').forEach(el => {
                const text = el.innerText.toLowerCase();
                el.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }
});
"""

with open('d:/My File/ALmEz0/1- Site - Copy/splayer.js', 'a', encoding='utf-8') as f:
    f.write(search_code)
