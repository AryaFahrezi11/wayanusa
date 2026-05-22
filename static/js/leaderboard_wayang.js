document.addEventListener('DOMContentLoaded', function() {
    loadLeaderboard('Beginner');

    document.getElementById('level-select').addEventListener('change', function() {
        const level = this.value;
        loadLeaderboard(level);
    });
});

async function loadLeaderboard(level) {
    // Show loading state
    const podiumContainer = document.getElementById('podium');
    podiumContainer.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(`/api/leaderboard?level=${level}`);
        if (!response.ok) {
            throw new Error('Failed to fetch leaderboard');
        }
        const data = await response.json();
        renderLeaderboard(data);
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        podiumContainer.innerHTML = `
            <div class="empty-leaderboard">
                <span class="empty-icon">😔</span>
                <p>Gagal memuat leaderboard. Coba lagi nanti.</p>
            </div>
        `;
        document.getElementById('leaderboard-tbody').innerHTML = '';
        document.getElementById('user-position').innerHTML = '';
    }
}

function renderLeaderboard(data) {
    const leaderboard = data.leaderboard;
    const yourRank = data.your_rank;
    const yourScore = data.your_score;

    // Render podium (reorder: 2nd, 1st, 3rd for visual layout)
    const podiumContainer = document.getElementById('podium');
    podiumContainer.innerHTML = '';

    if (leaderboard.length >= 3) {
        const podiumOrder = [1, 0, 2]; // silver, gold, bronze positions
        const rankLabels = ['🥇', '🥈', '🥉'];
        const rankNumbers = ['1', '2', '3'];

        podiumOrder.forEach(i => {
            const item = leaderboard[i];
            const podiumItem = document.createElement('div');
            podiumItem.className = `podium-item`;
            podiumItem.innerHTML = `
                <img src="${item.img}" alt="${item.name}" class="podium-avatar"
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2235%22 r=%2225%22 fill=%22%23d4af37%22/%3E%3Ccircle cx=%2250%22 cy=%22110%22 r=%2245%22 fill=%22%23d4af37%22/%3E%3C/svg%3E'">
                <div class="podium-name">${item.name}</div>
                <div class="podium-score-label">${item.score} Poin</div>
                <div class="podium-base">
                    <span class="podium-points">${rankLabels[i]}</span>
                    <span class="podium-rank">${rankNumbers[i]}</span>
                </div>
            `;
            podiumContainer.appendChild(podiumItem);
        });
    } else if (leaderboard.length > 0) {
        // Less than 3 players - show what we have
        leaderboard.forEach((item, index) => {
            const podiumItem = document.createElement('div');
            podiumItem.className = `podium-item`;
            const rankLabels = ['🥇', '🥈', '🥉'];
            podiumItem.innerHTML = `
                <img src="${item.img}" alt="${item.name}" class="podium-avatar"
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2235%22 r=%2225%22 fill=%22%23d4af37%22/%3E%3Ccircle cx=%2250%22 cy=%22110%22 r=%2245%22 fill=%22%23d4af37%22/%3E%3C/svg%3E'">
                <div class="podium-name">${item.name}</div>
                <div class="podium-score-label">${item.score} Poin</div>
                <div class="podium-base">
                    <span class="podium-points">${rankLabels[index] || '#' + (index + 1)}</span>
                    <span class="podium-rank">${index + 1}</span>
                </div>
            `;
            podiumContainer.appendChild(podiumItem);
        });
    } else {
        podiumContainer.innerHTML = `
            <div class="empty-leaderboard">
                <span class="empty-icon">🏆</span>
                <p>Belum ada data leaderboard untuk level ini.<br>Jadilah yang pertama!</p>
            </div>
        `;
    }

    // Render table with rank badges
    const tbody = document.getElementById('leaderboard-tbody');
    tbody.innerHTML = '';
    leaderboard.forEach((item, index) => {
        const row = document.createElement('tr');

        // Rank display with medal for top 3
        let rankDisplay = item.rank;
        if (item.rank === 1) rankDisplay = '🥇 1';
        else if (item.rank === 2) rankDisplay = '🥈 2';
        else if (item.rank === 3) rankDisplay = '🥉 3';
        else rankDisplay = `#${item.rank}`;

        row.innerHTML = `
            <td>${rankDisplay}</td>
            <td>${item.name}</td>
            <td>${item.level}</td>
            <td>${item.score} Poin</td>
        `;

        // Add staggered animation
        row.style.animation = `fadeInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${0.7 + index * 0.05}s both`;

        tbody.appendChild(row);
    });

    // Render user position
    const userPosition = document.getElementById('user-position');
    if (yourRank) {
        const total = leaderboard.length;
        const percentage = ((yourRank / total) * 100).toFixed(1);
        const percentageTop = (100 - parseFloat(percentage)).toFixed(1);

        let positionEmoji = '📊';
        if (yourRank <= 3) positionEmoji = '🏆';
        else if (yourRank <= 10) positionEmoji = '⭐';

        userPosition.innerHTML = `
            ${positionEmoji} Kamu berada di peringkat <strong>#${yourRank}</strong> dari ${total} pemain 
            — top <strong>${percentage}%</strong> pada level ini dengan <strong>${yourScore} poin</strong>
        `;
    } else {
        userPosition.innerHTML = '🔐 Login untuk melihat posisi peringkat kamu';
    }
}
