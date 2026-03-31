/* ============================================
   DEV EASY DOC - Application
   ============================================ */

const MAX_TABLE_ROWS = 10000;

class DevEasyDoc {
    constructor() {
        this.files = [];
        this.selectedFile = null;
        this.sortBy = 'name';
        this.sidebarCollapsed = false;

        // DOM references
        this.sidebar = document.getElementById('sidebar');
        this.fileList = document.getElementById('file-list');
        this.placeholder = document.getElementById('placeholder');
        this.fileViewer = document.getElementById('file-viewer');
        this.uploadModal = document.getElementById('upload-modal');
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.expandBtn = document.getElementById('sidebar-expand');
        this.toastContainer = document.getElementById('toast-container');

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadFiles();
    }

    /* ------------------------------------------
       Event Binding
       ------------------------------------------ */

    bindEvents() {
        // Sidebar actions
        document.getElementById('btn-sort').addEventListener('click', () => this.cycleSort());
        document.getElementById('btn-upload').addEventListener('click', () => this.showUploadModal());
        document.getElementById('btn-toggle').addEventListener('click', () => this.toggleSidebar());
        this.expandBtn.addEventListener('click', () => this.toggleSidebar());

        // Upload modal
        document.getElementById('modal-close').addEventListener('click', () => this.hideUploadModal());
        this.uploadModal.addEventListener('click', (e) => {
            if (e.target === this.uploadModal) this.hideUploadModal();
        });

        // Drop zone
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        // File input
        this.fileInput.addEventListener('change', () => {
            this.handleFiles(this.fileInput.files);
            this.fileInput.value = '';
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideUploadModal();
        });

        // Global drag-and-drop (drop anywhere on the page)
        document.body.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        document.body.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) {
                this.showUploadModal();
                setTimeout(() => this.handleFiles(e.dataTransfer.files), 100);
            }
        });
    }

    /* ------------------------------------------
       API Calls
       ------------------------------------------ */

    async loadFiles() {
        try {
            const response = await fetch(`/api/files?sort=${this.sortBy}`);
            if (!response.ok) throw new Error('Failed to fetch files');
            const data = await response.json();
            this.files = data.files;
            this.renderFileList();
        } catch (error) {
            console.error('Failed to load files:', error);
            this.showToast('파일 목록을 불러오지 못했습니다', 'error');
        }
    }

    async handleFiles(fileList) {
        if (!fileList || fileList.length === 0) return;

        const uploadList = document.getElementById('upload-list');
        uploadList.style.display = 'block';
        uploadList.innerHTML = '';

        const formData = new FormData();
        const items = [];

        for (const file of fileList) {
            formData.append('files', file);

            const item = document.createElement('div');
            item.className = 'upload-item';
            item.innerHTML = `
                <span class="upload-item-name">${this.escapeHtml(file.name)}</span>
                <span class="upload-item-status uploading">업로드 중...</span>
            `;
            uploadList.appendChild(item);
            items.push(item);
        }

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();

            data.results.forEach((result, i) => {
                if (i >= items.length) return;
                const status = items[i].querySelector('.upload-item-status');
                if (result.success) {
                    status.textContent = '완료';
                    status.className = 'upload-item-status success';
                } else {
                    status.textContent = result.error || '실패';
                    status.className = 'upload-item-status error';
                }
            });

            const successCount = data.results.filter(r => r.success).length;
            if (successCount > 0) {
                this.showToast(`${successCount}개 파일 업로드 완료`, 'success');
            }

            await this.loadFiles();
            setTimeout(() => this.hideUploadModal(), 1500);
        } catch (error) {
            console.error('Upload failed:', error);
            items.forEach(item => {
                const status = item.querySelector('.upload-item-status');
                status.textContent = '실패';
                status.className = 'upload-item-status error';
            });
            this.showToast('업로드에 실패했습니다', 'error');
        }
    }

    async deleteFile(filename) {
        if (!confirm(`"${filename}" 파일을 삭제하시겠습니까?`)) return;

        try {
            const response = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                if (this.selectedFile === filename) {
                    this.selectedFile = null;
                    this.showPlaceholder();
                }
                await this.loadFiles();
                this.showToast('파일이 삭제되었습니다', 'success');
            } else {
                this.showToast('파일 삭제에 실패했습니다', 'error');
            }
        } catch (error) {
            console.error('Delete failed:', error);
            this.showToast('파일 삭제에 실패했습니다', 'error');
        }
    }

    /* ------------------------------------------
       Sidebar Rendering
       ------------------------------------------ */

    renderFileList() {
        if (this.files.length === 0) {
            this.fileList.innerHTML = `
                <div class="file-list-empty">
                    <p>업로드된 파일이 없습니다</p>
                    <p>상단의 + 버튼을 클릭하여<br>파일을 업로드하세요</p>
                </div>
            `;
            return;
        }

        this.fileList.innerHTML = this.files.map(file => {
            const badgeText = file.type === 'htm' ? 'html' : file.type;
            const isActive = this.selectedFile === file.name;
            return `
                <div class="file-item ${isActive ? 'active' : ''}"
                     data-filename="${this.escapeAttr(file.name)}"
                     title="${this.escapeAttr(file.name)}">
                    <div class="file-badge ${this.escapeAttr(file.type)}">${this.escapeHtml(badgeText)}</div>
                    <div class="file-info">
                        <div class="file-name">${this.escapeHtml(file.name)}</div>
                        <div class="file-meta">${this.formatSize(file.size)}</div>
                    </div>
                    <button class="file-delete" title="삭제" data-delete="${this.escapeAttr(file.name)}">&times;</button>
                </div>
            `;
        }).join('');

        // Bind click events
        this.fileList.querySelectorAll('.file-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.file-delete')) return;
                this.viewFile(item.dataset.filename);
            });
        });

        this.fileList.querySelectorAll('.file-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(btn.dataset.delete);
            });
        });
    }

    /* ------------------------------------------
       File Viewing
       ------------------------------------------ */

    async viewFile(filename) {
        this.selectedFile = filename;
        this.renderFileList();

        this.placeholder.style.display = 'none';
        this.fileViewer.style.display = 'flex';
        this.fileViewer.style.flexDirection = 'column';

        const ext = this.getExtension(filename);

        if (ext === 'html' || ext === 'htm') {
            this.renderHTMLFile(filename);
        } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
            await this.renderSpreadsheet(filename);
        }
    }

    renderHTMLFile(filename) {
        const url = `/api/files/${encodeURIComponent(filename)}`;
        this.fileViewer.innerHTML = `
            <iframe src="${this.escapeAttr(url)}" 
                    sandbox="allow-scripts allow-popups" 
                    style="flex:1; width:100%; height:100%; border:none;">
            </iframe>
        `;
    }

    async renderSpreadsheet(filename) {
        this.fileViewer.innerHTML = '<div class="loading"><div class="spinner"></div><p>파일 로딩 중...</p></div>';

        try {
            const response = await fetch(`/api/files/${encodeURIComponent(filename)}`);
            if (!response.ok) throw new Error('Failed to fetch file');

            const arrayBuffer = await response.arrayBuffer();

            if (typeof XLSX === 'undefined') {
                this.fileViewer.innerHTML = `
                    <div class="loading">
                        <p>스프레드시트 라이브러리를 로드하지 못했습니다</p>
                        <p style="font-size:12px; color:var(--text-light);">인터넷 연결을 확인해주세요</p>
                    </div>
                `;
                return;
            }

            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
            const sheetNames = workbook.SheetNames;

            if (sheetNames.length === 0) {
                this.fileViewer.innerHTML = '<div class="loading"><p>시트가 없습니다</p></div>';
                return;
            }

            let html = '';

            // Sheet tabs (only if multiple sheets)
            if (sheetNames.length > 1) {
                html += '<div class="sheet-tabs">';
                sheetNames.forEach((name, i) => {
                    html += `<button class="sheet-tab ${i === 0 ? 'active' : ''}" data-sheet="${i}">${this.escapeHtml(name)}</button>`;
                });
                html += '</div>';
            }

            // Sheet content
            sheetNames.forEach((name, i) => {
                const sheet = workbook.Sheets[name];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                const display = i > 0 ? 'display:none;' : '';
                html += `<div class="table-container" data-sheet-content="${i}" style="${display}">`;

                if (jsonData.length === 0) {
                    html += '<div style="padding:40px; text-align:center; color:var(--text-light);">빈 시트입니다</div>';
                } else {
                    const totalRows = jsonData.length;
                    const limitedRows = Math.min(totalRows, MAX_TABLE_ROWS + 1); // +1 for header

                    html += '<table>';

                    // Header row
                    if (jsonData.length > 0) {
                        html += '<thead><tr>';
                        jsonData[0].forEach(cell => {
                            html += `<th>${this.escapeHtml(String(cell))}</th>`;
                        });
                        html += '</tr></thead>';
                    }

                    // Data rows
                    html += '<tbody>';
                    for (let r = 1; r < limitedRows; r++) {
                        html += '<tr>';
                        const row = jsonData[r];
                        const colCount = jsonData[0].length;
                        for (let c = 0; c < colCount; c++) {
                            const cell = row && c < row.length ? row[c] : '';
                            html += `<td>${this.escapeHtml(String(cell))}</td>`;
                        }
                        html += '</tr>';
                    }
                    html += '</tbody></table>';

                    if (totalRows - 1 > MAX_TABLE_ROWS) {
                        html += `<div class="table-row-limit">전체 ${(totalRows - 1).toLocaleString()}행 중 ${MAX_TABLE_ROWS.toLocaleString()}행만 표시됩니다</div>`;
                    }
                }

                html += '</div>';
            });

            this.fileViewer.innerHTML = html;

            // Bind sheet tab events
            this.fileViewer.querySelectorAll('.sheet-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const idx = tab.dataset.sheet;
                    this.fileViewer.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.fileViewer.querySelectorAll('[data-sheet-content]').forEach(c => c.style.display = 'none');
                    const target = this.fileViewer.querySelector(`[data-sheet-content="${idx}"]`);
                    if (target) target.style.display = '';
                });
            });
        } catch (error) {
            console.error('Failed to render spreadsheet:', error);
            this.fileViewer.innerHTML = `
                <div class="loading">
                    <p>파일을 렌더링하지 못했습니다</p>
                    <p style="font-size:12px; color:var(--text-light);">${this.escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }

    /* ------------------------------------------
       UI Actions
       ------------------------------------------ */

    showPlaceholder() {
        this.placeholder.style.display = 'flex';
        this.fileViewer.style.display = 'none';
        this.fileViewer.innerHTML = '';
    }

    cycleSort() {
        const sorts = ['name', 'date', 'type', 'size'];
        const labels = { name: '이름순', date: '날짜순', type: '유형순', size: '크기순' };
        const idx = sorts.indexOf(this.sortBy);
        this.sortBy = sorts[(idx + 1) % sorts.length];
        this.showToast(`정렬: ${labels[this.sortBy]}`, 'info');
        this.loadFiles();
    }

    toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        this.sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
        this.expandBtn.classList.toggle('visible', this.sidebarCollapsed);
    }

    showUploadModal() {
        this.uploadModal.style.display = 'flex';
        const uploadList = document.getElementById('upload-list');
        uploadList.style.display = 'none';
        uploadList.innerHTML = '';
    }

    hideUploadModal() {
        this.uploadModal.style.display = 'none';
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(16px)';
            toast.style.transition = '0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /* ------------------------------------------
       Utility
       ------------------------------------------ */

    getExtension(filename) {
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    escapeAttr(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new DevEasyDoc();
});
