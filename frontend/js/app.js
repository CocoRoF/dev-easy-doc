/* ============================================
   DEV EASY DOC - Application
   ============================================ */

const MAX_TABLE_ROWS = 10000;

class DevEasyDoc {
    constructor() {
        this.items = [];
        this.selectedFile = null;
        this.currentFolder = '';
        this.breadcrumb = [];
        this.sortBy = 'name';
        this.sidebarCollapsed = false;
        this.dragItem = null;

        // DOM references
        this.sidebar = document.getElementById('sidebar');
        this.fileList = document.getElementById('file-list');
        this.breadcrumbEl = document.getElementById('breadcrumb');
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
        document.getElementById('btn-sort').addEventListener('click', () => this.cycleSort());
        document.getElementById('btn-new-folder').addEventListener('click', () => this.promptNewFolder());
        document.getElementById('btn-upload').addEventListener('click', () => this.showUploadModal());
        document.getElementById('btn-toggle').addEventListener('click', () => this.toggleSidebar());
        this.expandBtn.addEventListener('click', () => this.toggleSidebar());

        document.getElementById('modal-close').addEventListener('click', () => this.hideUploadModal());
        this.uploadModal.addEventListener('click', (e) => {
            if (e.target === this.uploadModal) this.hideUploadModal();
        });

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
            this.handleUploadFiles(e.dataTransfer.files);
        });

        this.fileInput.addEventListener('change', () => {
            this.handleUploadFiles(this.fileInput.files);
            this.fileInput.value = '';
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideUploadModal();
        });

        document.body.addEventListener('dragover', (e) => {
            // Only handle external file drops, not internal drag-and-drop
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
            }
        });
        document.body.addEventListener('drop', (e) => {
            if (e.dataTransfer && e.dataTransfer.files.length > 0 && e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                this.showUploadModal();
                setTimeout(() => this.handleUploadFiles(e.dataTransfer.files), 100);
            }
        });
    }

    /* ------------------------------------------
       API Calls
       ------------------------------------------ */

    async loadFiles() {
        try {
            const params = new URLSearchParams({ folder: this.currentFolder, sort: this.sortBy });
            const response = await fetch(`/api/files?${params}`);
            if (!response.ok) throw new Error('Failed to fetch files');
            const data = await response.json();
            this.items = data.items;
            this.breadcrumb = data.breadcrumb || [];
            this.renderBreadcrumb();
            this.renderFileList();
        } catch (error) {
            console.error('Failed to load files:', error);
            this.showToast('파일 목록을 불러오지 못했습니다', 'error');
        }
    }

    async handleUploadFiles(fileList) {
        if (!fileList || fileList.length === 0) return;

        const uploadList = document.getElementById('upload-list');
        uploadList.style.display = 'block';
        uploadList.innerHTML = '';

        const formData = new FormData();
        formData.append('folder', this.currentFolder);
        const domItems = [];

        for (const file of fileList) {
            formData.append('files', file);
            const item = document.createElement('div');
            item.className = 'upload-item';
            item.innerHTML = `
                <span class="upload-item-name">${this.escapeHtml(file.name)}</span>
                <span class="upload-item-status uploading">업로드 중...</span>
            `;
            uploadList.appendChild(item);
            domItems.push(item);
        }

        try {
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Upload failed');
            const data = await response.json();

            data.results.forEach((result, i) => {
                if (i >= domItems.length) return;
                const status = domItems[i].querySelector('.upload-item-status');
                if (result.success) {
                    status.textContent = '완료';
                    status.className = 'upload-item-status success';
                } else {
                    status.textContent = result.error || '실패';
                    status.className = 'upload-item-status error';
                }
            });

            const successCount = data.results.filter(r => r.success).length;
            if (successCount > 0) this.showToast(`${successCount}개 파일 업로드 완료`, 'success');
            await this.loadFiles();
            setTimeout(() => this.hideUploadModal(), 1500);
        } catch (error) {
            console.error('Upload failed:', error);
            domItems.forEach(item => {
                const status = item.querySelector('.upload-item-status');
                status.textContent = '실패';
                status.className = 'upload-item-status error';
            });
            this.showToast('업로드에 실패했습니다', 'error');
        }
    }

    async deleteFile(filePath) {
        const name = filePath.split('/').pop();
        if (!confirm(`"${name}" 파일을 삭제하시겠습니까?`)) return;
        try {
            const response = await fetch(`/api/files/${encodeURIComponent(filePath)}`, { method: 'DELETE' });
            if (response.ok) {
                if (this.selectedFile === filePath) {
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

    async deleteFolder(folderPath) {
        const name = folderPath.split('/').pop();
        if (!confirm(`"${name}" 폴더와 내부 파일을 모두 삭제하시겠습니까?`)) return;
        try {
            const response = await fetch(`/api/folders/${encodeURIComponent(folderPath)}`, { method: 'DELETE' });
            if (response.ok) {
                await this.loadFiles();
                this.showToast('폴더가 삭제되었습니다', 'success');
            } else {
                const data = await response.json();
                this.showToast(data.detail || '폴더 삭제에 실패했습니다', 'error');
            }
        } catch (error) {
            this.showToast('폴더 삭제에 실패했습니다', 'error');
        }
    }

    async createFolder(name) {
        try {
            const response = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, parent: this.currentFolder }),
            });
            if (response.ok) {
                await this.loadFiles();
                this.showToast(`"${name}" 폴더 생성 완료`, 'success');
            } else {
                const data = await response.json();
                this.showToast(data.detail || '폴더 생성에 실패했습니다', 'error');
            }
        } catch (error) {
            this.showToast('폴더 생성에 실패했습니다', 'error');
        }
    }

    async moveItem(sourcePath, destFolder) {
        try {
            const response = await fetch('/api/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: sourcePath, destination: destFolder }),
            });
            if (response.ok) {
                await this.loadFiles();
                const name = sourcePath.split('/').pop();
                this.showToast(`"${name}" 이동 완료`, 'success');
            } else {
                const data = await response.json();
                this.showToast(data.detail || '이동에 실패했습니다', 'error');
            }
        } catch (error) {
            this.showToast('이동에 실패했습니다', 'error');
        }
    }

    /* ------------------------------------------
       Breadcrumb
       ------------------------------------------ */

    renderBreadcrumb() {
        if (!this.currentFolder) {
            this.breadcrumbEl.style.display = 'none';
            return;
        }
        this.breadcrumbEl.style.display = 'flex';
        let html = `<span class="breadcrumb-item breadcrumb-link" data-path="">ROOT</span>`;
        this.breadcrumb.forEach((item, i) => {
            html += `<span class="breadcrumb-sep">/</span>`;
            const isLast = i === this.breadcrumb.length - 1;
            if (isLast) {
                html += `<span class="breadcrumb-item breadcrumb-current">${this.escapeHtml(item.name)}</span>`;
            } else {
                html += `<span class="breadcrumb-item breadcrumb-link" data-path="${this.escapeAttr(item.path)}">${this.escapeHtml(item.name)}</span>`;
            }
        });
        this.breadcrumbEl.innerHTML = html;

        this.breadcrumbEl.querySelectorAll('.breadcrumb-link').forEach(el => {
            el.addEventListener('click', () => this.navigateToFolder(el.dataset.path));
        });
    }

    /* ------------------------------------------
       Sidebar Rendering
       ------------------------------------------ */

    renderFileList() {
        if (this.items.length === 0) {
            this.fileList.innerHTML = `
                <div class="file-list-empty">
                    <p>항목이 없습니다</p>
                    <p>상단의 + 버튼으로 파일을 업로드하거나<br>폴더를 만들어보세요</p>
                </div>
            `;
            return;
        }

        this.fileList.innerHTML = this.items.map(item => {
            if (item.isFolder) {
                return `
                    <div class="file-item folder-item"
                         draggable="true"
                         data-path="${this.escapeAttr(item.path)}"
                         data-is-folder="true"
                         title="${this.escapeAttr(item.name)}">
                        <div class="file-badge folder">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </div>
                        <div class="file-info">
                            <div class="file-name">${this.escapeHtml(item.name)}</div>
                            <div class="file-meta">${item.itemCount}개 항목</div>
                        </div>
                        <button class="file-delete" title="삭제" data-delete-folder="${this.escapeAttr(item.path)}">&times;</button>
                    </div>
                `;
            } else {
                const badgeText = item.type === 'htm' ? 'html' : item.type;
                const isActive = this.selectedFile === item.path;
                return `
                    <div class="file-item ${isActive ? 'active' : ''}"
                         draggable="true"
                         data-path="${this.escapeAttr(item.path)}"
                         data-is-folder="false"
                         title="${this.escapeAttr(item.name)}">
                        <div class="file-badge ${this.escapeAttr(item.type)}">${this.escapeHtml(badgeText)}</div>
                        <div class="file-info">
                            <div class="file-name">${this.escapeHtml(item.name)}</div>
                            <div class="file-meta">${this.formatSize(item.size)}</div>
                        </div>
                        <button class="file-delete" title="삭제" data-delete-file="${this.escapeAttr(item.path)}">&times;</button>
                    </div>
                `;
            }
        }).join('');

        this.bindFileListEvents();
    }

    bindFileListEvents() {
        // Click to open folder or view file
        this.fileList.querySelectorAll('.file-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.file-delete')) return;
                const isFolder = el.dataset.isFolder === 'true';
                if (isFolder) {
                    this.navigateToFolder(el.dataset.path);
                } else {
                    this.viewFile(el.dataset.path);
                }
            });

            // Drag start
            el.addEventListener('dragstart', (e) => {
                this.dragItem = el.dataset.path;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', el.dataset.path);
                el.classList.add('dragging');
            });

            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
                this.fileList.querySelectorAll('.drag-over').forEach(d => d.classList.remove('drag-over'));
                this.dragItem = null;
            });

            // Allow drop on folders only
            if (el.dataset.isFolder === 'true') {
                el.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    // Don't allow dropping on self
                    if (this.dragItem !== el.dataset.path) {
                        el.classList.add('drag-over');
                    }
                });

                el.addEventListener('dragleave', () => {
                    el.classList.remove('drag-over');
                });

                el.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    el.classList.remove('drag-over');
                    const sourcePath = e.dataTransfer.getData('text/plain');
                    if (sourcePath && sourcePath !== el.dataset.path) {
                        this.moveItem(sourcePath, el.dataset.path);
                    }
                });
            }
        });

        // Delete buttons
        this.fileList.querySelectorAll('[data-delete-file]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(btn.dataset.deleteFile);
            });
        });

        this.fileList.querySelectorAll('[data-delete-folder]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFolder(btn.dataset.deleteFolder);
            });
        });

        // Drop on breadcrumb (move to parent/root)
        this.breadcrumbEl.querySelectorAll('.breadcrumb-link').forEach(el => {
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                el.classList.add('drag-over');
            });
            el.addEventListener('dragleave', () => {
                el.classList.remove('drag-over');
            });
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.classList.remove('drag-over');
                const sourcePath = e.dataTransfer.getData('text/plain');
                if (sourcePath) {
                    this.moveItem(sourcePath, el.dataset.path);
                }
            });
        });
    }

    /* ------------------------------------------
       Navigation
       ------------------------------------------ */

    navigateToFolder(folderPath) {
        this.currentFolder = folderPath || '';
        this.loadFiles();
    }

    /* ------------------------------------------
       File Viewing
       ------------------------------------------ */

    async viewFile(filePath) {
        this.selectedFile = filePath;
        this.renderFileList();

        this.placeholder.style.display = 'none';
        this.fileViewer.style.display = 'flex';
        this.fileViewer.style.flexDirection = 'column';

        const ext = this.getExtension(filePath);

        if (ext === 'html' || ext === 'htm') {
            this.renderHTMLFile(filePath);
        } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
            await this.renderSpreadsheet(filePath);
        }
    }

    renderHTMLFile(filePath) {
        const url = `/api/files/${encodeURIComponent(filePath)}`;
        this.fileViewer.innerHTML = `
            <iframe src="${this.escapeAttr(url)}"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    style="flex:1; width:100%; height:100%; border:none;">
            </iframe>
        `;
    }

    async renderSpreadsheet(filePath) {
        this.fileViewer.innerHTML = '<div class="loading"><div class="spinner"></div><p>파일 로딩 중...</p></div>';

        try {
            const response = await fetch(`/api/files/${encodeURIComponent(filePath)}`);
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

            if (sheetNames.length > 1) {
                html += '<div class="sheet-tabs">';
                sheetNames.forEach((name, i) => {
                    html += `<button class="sheet-tab ${i === 0 ? 'active' : ''}" data-sheet="${i}">${this.escapeHtml(name)}</button>`;
                });
                html += '</div>';
            }

            sheetNames.forEach((name, i) => {
                const sheet = workbook.Sheets[name];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                const display = i > 0 ? 'display:none;' : '';
                html += `<div class="table-container" data-sheet-content="${i}" style="${display}">`;

                if (jsonData.length === 0) {
                    html += '<div style="padding:40px; text-align:center; color:var(--text-light);">빈 시트입니다</div>';
                } else {
                    const totalRows = jsonData.length;
                    const limitedRows = Math.min(totalRows, MAX_TABLE_ROWS + 1);

                    html += '<table>';
                    if (jsonData.length > 0) {
                        html += '<thead><tr>';
                        jsonData[0].forEach(cell => {
                            html += `<th>${this.escapeHtml(String(cell))}</th>`;
                        });
                        html += '</tr></thead>';
                    }

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

            this.fileViewer.querySelectorAll('.table-container td').forEach(td => {
                td.addEventListener('click', () => {
                    td.classList.toggle('expanded');
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

    promptNewFolder() {
        const name = prompt('새 폴더 이름을 입력하세요:');
        if (name && name.trim()) {
            this.createFolder(name.trim());
        }
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

document.addEventListener('DOMContentLoaded', () => {
    new DevEasyDoc();
});
