/* ========================================
   大村市育成会クラブ 指導記録管理Webアプリ
   メインアプリケーション
   ======================================== */

// --- 状態管理 ---
let state = {
    loggedIn: false,
    clubCode: '',
    userName: '',
    currentMonth: new Date(),
    editingRecordId: null
};

// --- データアクセス (localStorage) ---
function getData(key) {
    try {
        return JSON.parse(localStorage.getItem('omura_club_' + key)) || null;
    } catch { return null; }
}

function setData(key, value) {
    localStorage.setItem('omura_club_' + key, JSON.stringify(value));
}

function getClubSettings() {
    return getData('settings_' + state.clubCode) || {
        clubName: '',
        representative: '',
        instructors: [],
        hourlyRate: 1000,
        submissionEmail: ''
    };
}

function saveClubSettings(settings) {
    setData('settings_' + state.clubCode, settings);
}

function getRecords() {
    return getData('records_' + state.clubCode) || [];
}

function saveRecords(records) {
    setData('records_' + state.clubCode, records);
}

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', function() {
    const saved = getData('session');
    if (saved && saved.loggedIn) {
        state.loggedIn = true;
        state.clubCode = saved.clubCode;
        state.userName = saved.userName;
        showMainScreen();
    }
    updateTimeDisplay();
    document.getElementById('input-start').addEventListener('change', updateTimeDisplay);
    document.getElementById('input-end').addEventListener('change', updateTimeDisplay);
});

// --- ログイン ---
function doLogin() {
    const club = document.getElementById('login-club').value;
    const name = document.getElementById('login-name').value.trim();
    if (!club) { showToast('クラブを選択してください'); return; }
    if (!name) { showToast('氏名を入力してください'); return; }

    state.loggedIn = true;
    state.clubCode = club;
    state.userName = name;
    setData('session', { loggedIn: true, clubCode: club, userName: name });

    // 指導者に自分を追加（未登録の場合）
    const settings = getClubSettings();
    if (!settings.clubName) {
        const clubSelect = document.getElementById('login-club');
        settings.clubName = clubSelect.options[clubSelect.selectedIndex].text;
    }
    if (!settings.instructors.includes(name)) {
        settings.instructors.push(name);
    }
    saveClubSettings(settings);

    showMainScreen();
    showToast('ログインしました');
}

function doLogout() {
    if (!confirm('ログアウトしますか？')) return;
    state.loggedIn = false;
    state.clubCode = '';
    state.userName = '';
    localStorage.removeItem('omura_club_session');
    document.getElementById('screen-main').classList.remove('active');
    document.getElementById('screen-login').classList.add('active');
}

// --- メイン画面表示 ---
function showMainScreen() {
    document.getElementById('screen-login').classList.remove('active');
    document.getElementById('screen-main').classList.add('active');
    state.currentMonth = new Date();
    updateMonthLabel();
    renderRecords();
    loadSettings();
    updateInstructorSelects();
    updateReportMonth();
}

// --- タブ切り替え ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === 'tab-' + tabName);
    });
    if (tabName === 'report') {
        updateReportMonth();
    }
}

// --- 月操作 ---
function changeMonth(delta) {
    state.currentMonth.setMonth(state.currentMonth.getMonth() + delta);
    updateMonthLabel();
    renderRecords();
}

function updateMonthLabel() {
    const y = state.currentMonth.getFullYear();
    const m = state.currentMonth.getMonth() + 1;
    const reiwa = y - 2018;
    document.getElementById('current-month-label').textContent =
        `令和${reiwa}年${m}月`;
}

function getMonthKey(date) {
    if (typeof date === 'string') date = new Date(date);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

// --- 記録一覧 ---
function renderRecords() {
    const records = getRecords();
    const monthKey = getMonthKey(state.currentMonth);
    const filtered = records
        .filter(r => getMonthKey(r.date) === monthKey)
        .sort((a, b) => a.date.localeCompare(b.date));

    const list = document.getElementById('records-list');

    if (filtered.length === 0) {
        list.innerHTML = '<div class="records-empty">この月の活動記録はありません</div>';
        document.getElementById('summary-count').textContent = '0回';
        document.getElementById('summary-hours').textContent = '0.0時間';
        return;
    }

    let totalHours = 0;
    list.innerHTML = filtered.map(r => {
        const capped = Math.min(r.duration, 3.0);
        totalHours += capped;
        const d = new Date(r.date);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dayName = dayNames[d.getDay()];
        return `
            <div class="record-card" onclick="editRecord('${r.id}')">
                <div class="record-date">${formatDateJP(r.date)}（${dayName}）</div>
                <div class="record-time">${r.startTime} 〜 ${r.endTime}（${capped.toFixed(1)}時間）</div>
                <div class="record-location">${escapeHtml(r.location)}</div>
                <div class="record-report">${escapeHtml(r.report)}</div>
                <div class="record-instructor">${escapeHtml(r.instructor)}</div>
            </div>
        `;
    }).join('');

    document.getElementById('summary-count').textContent = filtered.length + '回';
    document.getElementById('summary-hours').textContent = totalHours.toFixed(1) + '時間';
}

// --- 入力フォーム ---
function showInputForm(recordId) {
    state.editingRecordId = recordId || null;
    const modal = document.getElementById('modal-input');
    const title = document.getElementById('input-modal-title');
    const deleteBtn = document.getElementById('btn-delete-record');

    updateInstructorSelects();
    updateLocationSuggestions();

    if (recordId) {
        title.textContent = '記録を編集';
        deleteBtn.style.display = 'flex';
        const record = getRecords().find(r => r.id === recordId);
        if (record) {
            document.getElementById('input-date').value = record.date;
            document.getElementById('input-start').value = record.startTime;
            document.getElementById('input-end').value = record.endTime;
            document.getElementById('input-location').value = record.location;
            document.getElementById('input-report').value = record.report;
            document.getElementById('input-instructor').value = record.instructor;
        }
    } else {
        title.textContent = '活動記録';
        deleteBtn.style.display = 'none';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('input-date').value = today;
        document.getElementById('input-start').value = '09:00';
        document.getElementById('input-end').value = '12:00';
        document.getElementById('input-location').value = getLastLocation();
        document.getElementById('input-report').value = '';
        document.getElementById('input-instructor').value = state.userName;
    }

    updateTimeDisplay();
    modal.classList.add('active');
}

function closeInputForm() {
    document.getElementById('modal-input').classList.remove('active');
    state.editingRecordId = null;
}

function editRecord(id) {
    showInputForm(id);
}

function updateTimeDisplay() {
    const start = document.getElementById('input-start').value;
    const end = document.getElementById('input-end').value;
    const display = document.getElementById('time-display');

    if (start && end) {
        const hours = calcDuration(start, end);
        if (hours <= 0) {
            display.textContent = '時間が正しくありません';
            display.className = 'time-display warning';
        } else if (hours > 3.0) {
            display.textContent = `指導時間: ${hours.toFixed(1)}時間（上限3.0時間が適用されます）`;
            display.className = 'time-display warning';
        } else {
            display.textContent = `指導時間: ${hours.toFixed(1)}時間`;
            display.className = 'time-display';
        }
    }
}

function calcDuration(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
}

function saveRecord() {
    const date = document.getElementById('input-date').value;
    const startTime = document.getElementById('input-start').value;
    const endTime = document.getElementById('input-end').value;
    const location = document.getElementById('input-location').value.trim();
    const report = document.getElementById('input-report').value.trim();
    const instructor = document.getElementById('input-instructor').value;

    if (!date) { showToast('指導日を入力してください'); return; }
    if (!startTime || !endTime) { showToast('時間を入力してください'); return; }
    if (!location) { showToast('活動場所を入力してください'); return; }
    if (!report) { showToast('活動報告を入力してください'); return; }
    if (!instructor) { showToast('記録者を選択してください'); return; }

    const duration = calcDuration(startTime, endTime);
    if (duration <= 0) { showToast('終了時間は開始時間より後にしてください'); return; }

    let records = getRecords();

    if (state.editingRecordId) {
        // 編集モード
        const idx = records.findIndex(r => r.id === state.editingRecordId);
        if (idx >= 0) {
            records[idx] = {
                ...records[idx],
                date, startTime, endTime, duration, location, report, instructor,
                updatedAt: new Date().toISOString()
            };
        }
    } else {
        // 新規 or 上書き
        const existing = records.find(r => r.date === date && r.instructor === instructor);
        if (existing) {
            if (!confirm(`${formatDateJP(date)}のデータを上書きします。よろしいですか？`)) return;
            existing.startTime = startTime;
            existing.endTime = endTime;
            existing.duration = duration;
            existing.location = location;
            existing.report = report;
            existing.updatedAt = new Date().toISOString();
        } else {
            records.push({
                id: generateId(),
                clubCode: state.clubCode,
                date, startTime, endTime, duration, location, report, instructor,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
    }

    saveRecords(records);
    closeInputForm();
    renderRecords();
    showToast('保存しました');
}

function deleteRecord() {
    if (!state.editingRecordId) return;
    if (!confirm('この記録を削除しますか？')) return;

    let records = getRecords();
    records = records.filter(r => r.id !== state.editingRecordId);
    saveRecords(records);
    closeInputForm();
    renderRecords();
    showToast('削除しました');
}

// --- 活動場所のサジェスト ---
function updateLocationSuggestions() {
    const records = getRecords();
    const locations = [...new Set(records.map(r => r.location).filter(Boolean))];
    const datalist = document.getElementById('location-suggestions');
    datalist.innerHTML = locations.map(l => `<option value="${escapeHtml(l)}">`).join('');
}

function getLastLocation() {
    const records = getRecords();
    if (records.length === 0) return '';
    const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted[0].location || '';
}

// --- 指導者セレクト更新 ---
function updateInstructorSelects() {
    const settings = getClubSettings();
    const instructors = settings.instructors || [];
    const html = instructors.map(name =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join('');

    document.getElementById('input-instructor').innerHTML = html;
    document.getElementById('report-instructor').innerHTML = html;

    // デフォルトでログインユーザーを選択
    document.getElementById('input-instructor').value = state.userName;
    document.getElementById('report-instructor').value = state.userName;
}

// --- 報告書 ---
function updateReportMonth() {
    const y = state.currentMonth.getFullYear();
    const m = String(state.currentMonth.getMonth() + 1).padStart(2, '0');
    document.getElementById('report-month').value = `${y}-${m}`;

    const settings = getClubSettings();
    document.getElementById('report-rate').value = settings.hourlyRate || 1000;
}

function generateReport() {
    const monthInput = document.getElementById('report-month').value;
    const instructor = document.getElementById('report-instructor').value;
    const rate = parseInt(document.getElementById('report-rate').value) || 0;

    if (!monthInput) { showToast('対象月を選択してください'); return; }
    if (!instructor) { showToast('指導者を選択してください'); return; }

    const [year, month] = monthInput.split('-').map(Number);
    const reiwa = year - 2018;
    const records = getRecords();
    const filtered = records
        .filter(r => {
            const d = new Date(r.date);
            return d.getFullYear() === year && d.getMonth() + 1 === month && r.instructor === instructor;
        })
        .sort((a, b) => a.date.localeCompare(b.date));

    const settings = getClubSettings();

    // 時間計算
    let totalCapped = 0;
    const rows = [];
    for (let i = 0; i < 7; i++) {
        if (i < filtered.length) {
            const r = filtered[i];
            const capped = Math.min(r.duration, 3.0);
            totalCapped += capped;
            const d = new Date(r.date);
            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            rows.push({
                date: `${d.getMonth() + 1}月${d.getDate()}日（${dayNames[d.getDay()]}）`,
                startTime: r.startTime,
                endTime: r.endTime,
                durationHM: formatHoursToHM(capped),
                location: r.location,
                report: r.report
            });
        } else {
            rows.push(null);
        }
    }

    const payAmount = totalCapped * rate;

    // HTML生成（大村市様式に準拠）
    const content = document.getElementById('report-content');
    content.innerHTML = `
        <div class="report-title-row">
            <span class="report-title">地域クラブ指導実績報告書（令和${reiwa}年${month}月分）</span>
            <span class="report-note">（休日分のみ記入してください。）</span>
        </div>
        <div class="report-header-info">
            <div class="report-header-row">
                <span class="report-header-label">地域クラブ名：</span>
                <span class="report-header-value">${escapeHtml(settings.clubName || '（未設定）')}</span>
            </div>
            <div class="report-header-row">
                <span class="report-header-label">代表者氏名：</span>
                <span class="report-header-value">${escapeHtml(settings.representative || '（未設定）')}</span>
            </div>
            <div class="report-header-row">
                <span class="report-header-label">指導者氏名：</span>
                <span class="report-header-value">${escapeHtml(instructor)}</span>
            </div>
        </div>
        <table class="report-table">
            <colgroup>
                <col class="col-date">
                <col class="col-start">
                <col class="col-tilde-w">
                <col class="col-end">
                <col class="col-dur">
                <col class="col-loc">
                <col class="col-rep">
            </colgroup>
            <thead>
                <tr>
                    <th>指導日</th>
                    <th colspan="4">指導時間（２４時間表記）</th>
                    <th>活動場所</th>
                    <th>活動報告</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => {
                    if (!r) return `<tr><td></td><td></td><td class="col-tilde">～</td><td></td><td>0:00</td><td></td><td></td></tr>`;
                    return `<tr>
                        <td>${escapeHtml(r.date)}</td>
                        <td>${r.startTime}</td>
                        <td class="col-tilde">～</td>
                        <td>${r.endTime}</td>
                        <td>${r.durationHM}</td>
                        <td class="text-left">${escapeHtml(r.location)}</td>
                        <td class="text-left">${escapeHtml(r.report)}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        <div class="report-footer-info">
            <div class="report-footer-row">
                <span class="footer-label">指導時間計（１日３時間上限）</span>
                <span class="footer-value">${totalCapped.toFixed(2)}</span>
                <span class="footer-unit">時間</span>
            </div>
            <div class="report-footer-row">
                <span class="footer-label">時間単価</span>
                <span class="footer-value">${rate ? rate.toLocaleString() : ''}</span>
                <span class="footer-unit">円</span>
            </div>
            <div class="report-footer-row">
                <span class="footer-label">指導報酬支給額</span>
                <span class="footer-value">${payAmount ? payAmount.toLocaleString() : '0'}</span>
                <span class="footer-unit">円</span>
            </div>
        </div>
    `;

    document.getElementById('report-preview').style.display = 'block';
    document.getElementById('report-preview').scrollIntoView({ behavior: 'smooth' });
}

// --- PDF出力・共有 ---
function getReportFileName() {
    const monthInput = document.getElementById('report-month').value;
    const instructor = document.getElementById('report-instructor').value;
    const settings = getClubSettings();
    const [year, month] = monthInput.split('-').map(Number);
    const reiwa = year - 2018;
    const clubName = (settings.clubName || 'クラブ').replace(/\s/g, '');
    const instructorName = instructor.replace(/\s/g, '');
    return `指導実績報告書_${clubName}_R${reiwa}年${month}月分_${instructorName}.pdf`;
}

function buildReportHTML() {
    const src = document.getElementById('report-content').innerHTML;
    return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Noto Sans JP',sans-serif;width:1050px;padding:30px 40px;background:#fff;color:#000;font-size:13px;}
.report-title-row{margin-bottom:14px;}
.report-title{font-size:17px;font-weight:700;}
.report-note{font-size:12px;margin-left:16px;}
.report-header-info{margin-bottom:18px;margin-left:380px;}
.report-header-row{margin-bottom:3px;font-size:13px;display:flex;align-items:center;}
.report-header-label{white-space:nowrap;}
.report-header-value{border-bottom:1px solid #000;padding-left:8px;padding-bottom:1px;flex:1;}
.report-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;table-layout:fixed;}
.report-table th,.report-table td{border:1px solid #000;padding:6px 8px;text-align:center;word-break:break-all;}
.report-table th{font-weight:500;font-size:11px;}
.report-table .col-date{width:110px;}
.report-table .col-start,.report-table .col-end{width:60px;}
.report-table .col-tilde-w{width:25px;}
.report-table .col-dur{width:50px;}
.report-table .col-loc{width:170px;}
.col-tilde{border-left:none!important;border-right:none!important;}
.text-left{text-align:left!important;}
.report-footer-info{margin-left:280px;margin-top:16px;}
.report-footer-row{display:flex;align-items:baseline;margin-bottom:5px;font-size:13px;}
.footer-label{min-width:260px;}
.footer-value{text-align:right;min-width:70px;}
.footer-unit{margin-left:8px;}
</style></head><body>${src}</body></html>`;
}

function exportPDF() {
    showToast('PDF生成中...');

    // iframeでレンダリング（ページスタイルの干渉を完全に排除）
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;left:-9999px;top:0;width:1050px;height:800px;border:none;';
    document.body.appendChild(iframe);

    const htmlContent = buildReportHTML();
    iframe.contentDocument.open();
    iframe.contentDocument.write(htmlContent);
    iframe.contentDocument.close();

    setTimeout(() => {
        html2canvas(iframe.contentDocument.body, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: 1050,
            windowWidth: 1050
        }).then(canvas => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            const pageWidth = 297;
            const margin = 12;
            const contentWidth = pageWidth - margin * 2;
            const contentHeight = (canvas.height * contentWidth) / canvas.width;

            const imgData = canvas.toDataURL('image/png');
            doc.addImage(imgData, 'PNG', margin, margin, contentWidth, Math.min(contentHeight, 186));

            const fileName = getReportFileName();

            // Web Share API対応（スマホ向け）
            if (navigator.share && navigator.canShare) {
                const pdfBlob = doc.output('blob');
                const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
                if (navigator.canShare({ files: [file] })) {
                    // 共有可能 → 共有シートを表示
                    lastGeneratedPdf = { blob: pdfBlob, fileName: fileName };
                    document.getElementById('btn-share-pdf').style.display = 'flex';
                }
            }

            doc.save(fileName);
            document.body.removeChild(iframe);
            showToast('PDFをダウンロードしました');
        }).catch(err => {
            console.error('PDF生成エラー:', err);
            document.body.removeChild(iframe);
            showToast('PDF生成に失敗しました');
        });
    }, 500);
}

// 共有用のPDFデータを保持
let lastGeneratedPdf = null;

function sharePDF() {
    if (!lastGeneratedPdf) {
        showToast('先にPDFを生成してください');
        return;
    }
    const file = new File([lastGeneratedPdf.blob], lastGeneratedPdf.fileName, { type: 'application/pdf' });
    navigator.share({
        title: '指導実績報告書',
        text: '指導実績報告書を送付します。',
        files: [file]
    }).then(() => {
        showToast('共有しました');
    }).catch(err => {
        if (err.name !== 'AbortError') {
            console.error('共有エラー:', err);
            showToast('共有に失敗しました');
        }
    });
}

// --- 設定 ---
function loadSettings() {
    const settings = getClubSettings();
    document.getElementById('setting-club-name').value = settings.clubName || '';
    document.getElementById('setting-representative').value = settings.representative || '';
    renderInstructorList(settings.instructors || []);

    // 設定変更時に自動保存
    document.getElementById('setting-club-name').addEventListener('change', saveSettings);
    document.getElementById('setting-representative').addEventListener('change', saveSettings);
}

function saveSettings() {
    const settings = getClubSettings();
    settings.clubName = document.getElementById('setting-club-name').value.trim();
    settings.representative = document.getElementById('setting-representative').value.trim();
    saveClubSettings(settings);
}

function renderInstructorList(instructors) {
    const container = document.getElementById('instructor-list');
    container.innerHTML = instructors.map((name, i) => `
        <div class="instructor-item">
            <input type="text" value="${escapeHtml(name)}" onchange="updateInstructorName(${i}, this.value)">
            <button class="btn-remove" onclick="removeInstructor(${i})">×</button>
        </div>
    `).join('');
}

function addInstructor() {
    const name = prompt('指導者名を入力してください');
    if (!name || !name.trim()) return;
    const settings = getClubSettings();
    settings.instructors.push(name.trim());
    saveClubSettings(settings);
    renderInstructorList(settings.instructors);
    updateInstructorSelects();
}

function updateInstructorName(index, newName) {
    const settings = getClubSettings();
    if (settings.instructors[index]) {
        settings.instructors[index] = newName.trim();
        saveClubSettings(settings);
        updateInstructorSelects();
    }
}

function removeInstructor(index) {
    if (!confirm('この指導者を削除しますか？')) return;
    const settings = getClubSettings();
    settings.instructors.splice(index, 1);
    saveClubSettings(settings);
    renderInstructorList(settings.instructors);
    updateInstructorSelects();
}

// --- サンプルデータ ---
function loadSampleData() {
    if (!confirm('サンプルデータを読み込みますか？\n（既存データは保持されます）')) return;

    const settings = getClubSettings();
    settings.clubName = settings.clubName || '○○クラブ（大村中学校 野球部育成会）';
    settings.representative = settings.representative || '大村 太郎';
    settings.hourlyRate = 1000;
    if (!settings.instructors.includes('田中 一郎')) settings.instructors.push('田中 一郎');
    if (!settings.instructors.includes('佐藤 健太')) settings.instructors.push('佐藤 健太');
    saveClubSettings(settings);

    const records = getRecords();
    const sampleRecords = [
        {
            id: generateId(), clubCode: state.clubCode,
            date: '2026-04-04', startTime: '09:00', endTime: '12:00', duration: 3.0,
            location: '○○中学校グラウンド', report: '基本練習、試合形式練習',
            instructor: '田中 一郎',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        },
        {
            id: generateId(), clubCode: state.clubCode,
            date: '2026-04-12', startTime: '09:30', endTime: '12:00', duration: 2.5,
            location: '○○中学校グラウンド', report: '基本練習、練習試合',
            instructor: '田中 一郎',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        },
        {
            id: generateId(), clubCode: state.clubCode,
            date: '2026-04-18', startTime: '09:00', endTime: '12:30', duration: 3.5,
            location: '○○中学校グラウンド', report: '基本練習、試合形式練習',
            instructor: '田中 一郎',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        },
        {
            id: generateId(), clubCode: state.clubCode,
            date: '2026-04-25', startTime: '13:00', endTime: '16:00', duration: 3.0,
            location: '○○中学校グラウンド', report: '基本練習、練習試合',
            instructor: '田中 一郎',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        }
    ];

    // 重複チェックして追加
    sampleRecords.forEach(sample => {
        const exists = records.find(r => r.date === sample.date && r.instructor === sample.instructor);
        if (!exists) records.push(sample);
    });

    saveRecords(records);
    loadSettings();
    updateInstructorSelects();
    renderRecords();
    showToast('サンプルデータを読み込みました');
}

function resetData() {
    if (!confirm('すべてのデータをリセットしますか？\nこの操作は元に戻せません。')) return;
    if (!confirm('本当にリセットしますか？')) return;
    localStorage.removeItem('omura_club_records_' + state.clubCode);
    localStorage.removeItem('omura_club_settings_' + state.clubCode);
    loadSettings();
    renderRecords();
    showToast('データをリセットしました');
}

// --- ユーティリティ ---
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDateJP(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatHoursToHM(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${String(m).padStart(2, '0')}`;
}

function toReiwa(year) {
    return year - 2018;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}
