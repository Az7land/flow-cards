// 使用严格模式
'use strict';
// 引入 Obsidian 模块
var obsidian = require('obsidian');

// 定义自定义视图类型
const CUSTOM_VIEW_TYPE = 'flow-cards-view';

// 定义默认设置
const DEFAULT_SETTINGS = { };

// 插件类
class FlowCardsPlugin extends obsidian.Plugin {
    settings = DEFAULT_SETTINGS;
    view;

    async onload() {
        console.log('Flow Cards Plugin: Loading 1.0...');
        await this.loadSettings();

        // 注册自定义视图
        this.registerView(CUSTOM_VIEW_TYPE, (leaf) => {
            this.view = new FlowCardsView(leaf, this);
            return this.view;
        });
        await this.activateView();

        
        // 注册设置选项卡
        this.addSettingTab(new FlowCardsSettingTab(this.app, this));


        // 注册快捷键
        this.addCommand({
            id: 'timer-start-pause',
            name: '开始/暂停计时器',
			hotkeys: [{modifiers: [],key:this.settings.timerStartPauseHotkey}],
            callback: () => {
                if (this.view) {
                    if (this.view.timerPaused) {
                        this.view.startTimer();
                        this.view.timerStartPauseButton.textContent = '暂停';
                    } else {
                        this.view.pauseTimer();
                    }
                }
            }
        });

        this.addCommand({
            id: 'timer-reset',
            name: '重置计时器',
			hotkeys: [{modifiers: [],key:this.settings.timerResetHotkey}],
            callback: () => {
                if (this.view) {
                    this.view.resetTimer();
                    this.view.timerStartPauseButton.textContent = '开始';
                }
            }
        });

        this.addCommand({
            id: 'carousel-pause',
            name: '暂停/继续轮播',
			hotkeys: [{modifiers: [],key:this.settings.carouselPauseHotkey}],
            callback: () => {
                if (this.view) {
                    this.view.carouselPaused = !this.view.carouselPaused;
                    if (this.view.carouselPaused) {
                        this.view.carouselPauseButton.textContent = '继续';
                    } else {
                        this.view.carouselPauseButton.textContent = '暂停';
                    }
                }
            }
        });

        // 注册快速打开视图的快捷键
        this.addCommand({
            id: 'open-flow-cards',
            name: '快速打开 Flow Cards 视图',
			hotkeys: [{modifiers: [],key:this.settings.openViewHotkey}],
            callback: () => {
				const { workspace } = this.app;
				let leaf = null;
				const leaves = workspace.getLeavesOfType(CUSTOM_VIEW_TYPE);

				if (leaves.length > 0) {
					leaf = leaves[0];
				} else {
					leaf = workspace.getRightLeaf(false);
					leaf?.setViewState({ type: CUSTOM_VIEW_TYPE, active: true });
				}
				workspace.revealLeaf(leaf);

            }
        });

    }

    onunload() {
        console.log('Flow Cards Plugin: Unloading...');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView(){
        let leaf;
        const leaves = this.app.workspace.getLeavesOfType(CUSTOM_VIEW_TYPE);
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            try {
                leaf = this.app.workspace.getRightLeaf(false);
            } catch (error) {
                console.log(error)
                console.log('重启插件即可')
            }
            leaf == null ? void 0 : leaf.setViewState({ type: CUSTOM_VIEW_TYPE, active: true });
        }
        this.app.workspace.revealLeaf(leaf);
        

    }


}


// 视图类，继承自 ItemView
class FlowCardsView extends obsidian.ItemView {
    constructor(leaf, plugin, data) {
        super(leaf);
        this.plugin = plugin;
        this.data = data;
        this.startTime = null;
        this.elapsedTime = 0;
        this.timerInterval = null;
        this.timerPaused = true;

        this.dictionaryLines = [];
        this.currentLineIndex = 0;
        this.carouselInterval = null;
        this.carouselPaused = false;
    }

    // 获取视图类型
    getViewType() {
        return CUSTOM_VIEW_TYPE;
    }

    // 获取显示文本
    getDisplayText() {
        return 'Flow Cards';
    }

    // 获取图标
    getIcon() {
        return 'coffee';
    }

    // 视图加载时的处理
    async onOpen() {
        // 获取视图内容容器
        const leafContainer = this.containerEl.getElementsByClassName('view-content')[0];

        // 创建计时器区域容器
        const timerContainer = leafContainer.createDiv({ cls: 'custom-timer-container' });
        // 创建计时器显示区域
        this.timerEl = timerContainer.createEl('div', { text: '00:00:00', cls: 'timer' });
        // 创建按钮区域
        const timerButtonArea = timerContainer.createDiv({ cls: 'timer-area' });

        // 创建“开始/暂停”按钮
        this.timerStartPauseButton = timerButtonArea.createEl('button', { text: '开始', cls: 'timer-starter timer-button' });
        this.timerStartPauseButton.addEventListener('click', () => {
            if (this.timerPaused) {
                this.startTimer();
                this.timerStartPauseButton.textContent = '暂停';
            } else {
                this.pauseTimer();
                this.timerStartPauseButton.textContent = '继续';
            }
        });

        // 创建“重置”按钮
        this.timerResetButton = timerButtonArea.createEl('button', { text: '重置', cls: 'timer-reseter timer-button' });
        this.timerResetButton.addEventListener('click', () => {
            this.resetTimer();
            this.timerStartPauseButton.textContent = '开始';
        });

        // 创建轮播区域容器
        const carouselContainer = leafContainer.createDiv({ cls: 'custom-carousel-container' });
        // 创建轮播显示区域
        this.carouselElA = carouselContainer.createEl('div', { text: '', cls: 'carousel-A carousel' });
        this.carouselElLine = carouselContainer.createEl('p', { text: '', cls: 'carousel-line' });
        this.carouselElB = carouselContainer.createEl('div', { text: '', cls: 'carousel-B carousel' });

        // 创建按钮区域
        const carouselButtonArea = carouselContainer.createDiv({ cls: 'carousel-area' });

        // 创建“刷新”按钮
        const carouselRefreshButton = carouselButtonArea.createEl('button', { text: '刷新', cls: 'carousel-refresher carousel-button' });
        carouselRefreshButton.addEventListener('click', async () => {
            await this.loadDictionary();
            this.updateCarousel();
        });

        // 创建“暂停轮播”按钮
        this.carouselPauseButton = carouselButtonArea.createEl('button', { text: '暂停', cls: 'carousel-pauser carousel-button' });
        this.carouselPauseButton.addEventListener('click', () => {
            this.carouselPaused = !this.carouselPaused;
            if (this.carouselPaused) {
                this.carouselPauseButton.textContent = '继续';
            } else {
                this.carouselPauseButton.textContent = '暂停';
            }
        });

        // 从卡片文件中加载内容
        await this.loadDictionary();
        // 启动轮播
        this.startCarousel();
    }

    // 从卡片文件中加载内容
    async loadDictionary() {
        try {
            // 获取卡片文件
            const dictionaryFile = this.app.vault.getFiles().find(file => file.basename === this.plugin.settings.dictionaryFileName);
            if (!dictionaryFile) {
                new obsidian.Notice(`卡片文件 "${this.plugin.settings.dictionaryFileName}" 未找到！`);
                return;
            }
            // 读取文件内容
            const content = await this.app.vault.read(dictionaryFile);
            const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            // 计算结束行索引
            let endLineIndex;
            if (this.plugin.settings.endLine < 0) {
                endLineIndex = lines.length + this.plugin.settings.endLine;
            } else {
                endLineIndex = this.plugin.settings.endLine - 1;
            }
            // 提取从指定起始行到结束行的内容
            this.dictionaryLines = lines.slice(this.plugin.settings.startLine - 1, endLineIndex + 1);
            // 如果当前行索引超出范围，重置为0
            if (this.currentLineIndex >= this.dictionaryLines.length) {
                this.currentLineIndex = 0;
            }
        } catch (error) {
            new obsidian.Notice(`加载卡片文件时出错：${error.message}`);
        }
    }


    // 启动轮播
    startCarousel() {
        if (this.carouselInterval) return;
        this.updateCarousel();
        this.carouselInterval = setInterval(() => {
            if (!this.carouselPaused) { // 只有在未暂停时才更新轮播
                this.updateCarousel();
            }
        }, this.plugin.settings.carouselIntervalTime);
    }

    

    // 更新轮播显示
    updateCarousel() {
        let intervals = this.plugin.settings.intervals;
        if (this.dictionaryLines.length === 0) return;
        // 更新显示的行
        const carouselText = this.dictionaryLines[this.currentLineIndex];
        const cText = carouselText.split('.')[1];
        this.carouselElA.setText(cText.split(intervals)[0]);
        this.carouselElB.setText(cText.split(intervals)[1] || '');
        // 切换到下一行
        this.currentLineIndex = (this.currentLineIndex + 1) % this.dictionaryLines.length;
    }


    // 启动计时器
    startTimer() {
        if (!this.timerPaused) return;
        this.startTime = Date.now() - this.elapsedTime;
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
        this.timerPaused = false;
    }

    // 暂停计时器
    pauseTimer() {
        this.copyTimeToClipboard();
        if (this.timerPaused) return;
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.elapsedTime = Date.now() - this.startTime;
        this.timerPaused = true;
    }

    // 重置计时器
    resetTimer() {
        this.pauseTimer();
        this.elapsedTime = 0;
        this.timerEl.setText('00:00:00');
        this.timerPaused = true;
    }

    // 更新计时器显示
    updateTimer() {
        const currentTime = Date.now();
        const elapsedTime = currentTime - this.startTime;
        const seconds = Math.floor(elapsedTime / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        // 格式化时间显示
        this.timerEl.setText(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    }

    // 复制当前时间到剪切板
    copyTimeToClipboard() {
        const timeText = this.timerEl.textContent;
        navigator.clipboard.writeText(timeText).then(() => {
            new obsidian.Notice(`时间已复制到剪切板：${timeText}`);
        }).catch(err => {
            new obsidian.Notice(`复制失败：${err}`);
        });
    }


    // 视图关闭时的处理
    onClose() {
        clearInterval(this.timerInterval);
        clearInterval(this.carouselInterval);
    }
}



// 设置选项卡类
class FlowCardsSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.fileInput = null;
        this.suggestionsContainer = null;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        const settingInfo = containerEl.createEl('div', { cls: 'setting-info' }); 
        settingInfo.createEl('h2', { text: 'Flow Cards 设置' });
        // settingInfo.createEl('p', { text: '『默认快捷键 F8』含有一个计时器（支持暂停复制）和卡片轮播器（支持暂停和刷新），可设置轮播的文件；提供遮挡模式' }); 

        const settingHeaders = containerEl.createEl('div', { cls: 'setting-headers' }); 
        settingHeaders.createEl('p',{text:'侧边栏卡组',cls: 'headers-tab'})

        const settingContent = containerEl.createEl('div', { cls: 'setting-content' }); 
        const sideLeaf = settingContent.createEl('div', { cls: 'flow-cards-side-leaf setting-flow' }); 

        // 添加文档名称设置
        new obsidian.Setting(sideLeaf)
            .setName('卡组文件名称')
            .setDesc('请输入卡组文件的名称（不包括扩展名）。')
            .addText(text => {
                this.fileInput = text.inputEl;
                text.setValue(this.plugin.settings.dictionaryFileName)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionaryFileName = value;
                        await this.plugin.saveSettings();
                        this.plugin.view.loadDictionary();
                    });
                this.fileInput.addEventListener('input', this.showSuggestions.bind(this));
                this.fileInput.addEventListener('blur', () => this.checkFileExistence(this.fileInput.value));
            });


        // 添加正反面分隔符
        new obsidian.Setting(sideLeaf)
            .setName('正反面分隔符')
            .setDesc('请输入正反面分隔符，默认设置为2个空格。')
            .addText(text => {
                text.setValue(this.plugin.settings.intervals)
                    .onChange(async (value) => {
                        this.plugin.settings.intervals = value;
                        await this.plugin.saveSettings();
                        this.plugin.view.updateCarousel(value); 
                    });
            });

            

        // 创建提示列表容器
        this.suggestionsContainer = sideLeaf.createDiv({ cls: 'suggestions-container' });
        this.suggestionsContainer.style.width = `${this.fileInput.offsetWidth}px`;
        this.suggestionsContainer.style.position = 'absolute';
        this.suggestionsContainer.style.zIndex = '1000';
        this.suggestionsContainer.style.background = '#fff';
        this.suggestionsContainer.style.border = '1px solid #ccc';
        this.suggestionsContainer.style.borderTop = 'none';
        this.suggestionsContainer.style.maxHeight = '100px';
        this.suggestionsContainer.style.overflowY = 'auto';

        // 添加起始行设置
        new obsidian.Setting(sideLeaf)
            .setName('起始行')
            .setDesc('请输入轮播的起始行号，空行不计数。')
            .addText(text => {
                text.setValue(this.plugin.settings.startLine.toString())
                    .onChange(async (value) => {
                        const parsedValue = parseInt(value, 10);
                        if (!isNaN(parsedValue) && parsedValue > 0) {
                            this.plugin.settings.startLine = parsedValue;
                            await this.plugin.saveSettings();
                        } else {
                            new obsidian.Notice('请输入一个有效的正整数作为起始行号');
                        }
                    })
            });

        // 添加结束行设置
        new obsidian.Setting(sideLeaf)
            .setName('结束行')
            .setDesc('请输入轮播的结束行号。支持负数，例如 -1 表示倒数第一行，-2 表示倒数第二行。')
            .addText(text => {
                text.setValue(this.plugin.settings.endLine.toString())
                    .onChange(async (value) => {
                        const parsedValue = parseInt(value, 10);
                        if (!isNaN(parsedValue)) {
                            this.plugin.settings.endLine = parsedValue;
                            await this.plugin.saveSettings();
                        } else {
                            new obsidian.Notice('请输入一个有效的整数作为结束行号');
                        }
                    });
            });

        // 添加轮播间隔时间设置
        new obsidian.Setting(sideLeaf)
            .setName('轮播间隔时间')
            .setDesc('请输入轮播的间隔时间（单位：毫秒）。')
            .addText(text => {
                text.setValue(this.plugin.settings.carouselIntervalTime.toString())
                    .onChange(async (value) => {
                        const parsedValue = parseInt(value, 10);
                        if (!isNaN(parsedValue) && parsedValue > 0) {
                            this.plugin.settings.carouselIntervalTime = parsedValue;
                            await this.plugin.saveSettings();
                            this.plugin.view.startCarousel();
                        } else {
                            new obsidian.Notice('请输入一个有效的正整数作为轮播间隔时间');
                        }
                    });
            });
         
        
        // 遮挡模式
        // 设置页调用css修改，视图监听效果为鼠标移入时显示
        new obsidian.Setting(sideLeaf)
            .setName("遮挡模式")
            .setDesc("请选择遮挡模式（将鼠标移入卡片会暂时取消遮挡）。")
            .addDropdown(dropdown => dropdown
              .addOption("-1", "不遮挡")
              .addOption("0", "遮挡上面")
              .addOption("1", "遮挡下面")
              .setValue(this.plugin.settings.setCoverMode || -1)
              .onChange(async (value) => {
                this.plugin.settings.setCoverMode = value;
                await this.plugin.saveSettings();
                this.onCoverMode(value);
            })
        );

            
        // const leafHeaders = document.getElementsByClassName('headers-tab');
        // leafHeaders[0].classList.add('checked-now');
        // leafHeaders[1].classList.remove('checked-now');
        // sideLeaf.style.display = 'block';
        // sideLeaf2.style.display = 'none';
        // leafHeaders[0].addEventListener('click', () => {
        //     sideLeaf.style.display = 'block';
        //     sideLeaf2.style.display = 'none';
        //     leafHeaders[0].classList.add('checked-now');
        //     leafHeaders[1].classList.remove('checked-now');
        // });
        // leafHeaders[1].addEventListener('click', () => {
        //     sideLeaf.style.display = 'none';
        //     sideLeaf2.style.display = 'block';
        //     leafHeaders[0].classList.remove('checked-now');
        //     leafHeaders[1].classList.add('checked-now');
        // });



    }

    // 显示提示列表
    showSuggestions() {
        const input = this.fileInput.value;
        if (!input) {
            this.suggestionsContainer.empty();
            return;
        }
        const files = this.app.vault.getFiles().map(file => file.basename);
        const suggestions = files.filter(file => file.startsWith(input)).slice(0, 5);
        this.suggestionsContainer.empty();
        suggestions.forEach(suggestion => {
            const suggestionEl = this.suggestionsContainer.createEl('div', { text: suggestion, cls: 'suggestion' });
            suggestionEl.style.padding = '4px 8px';
            suggestionEl.style.cursor = 'pointer';
            suggestionEl.addEventListener('click', () => {
                this.fileInput.value = suggestion;
                this.suggestionsContainer.empty();
            });
        });
        this.suggestionsContainer.style.width = `${this.fileInput.offsetWidth}px`;
        this.suggestionsContainer.style.left = `${this.fileInput.offsetLeft}px`;
        this.suggestionsContainer.style.top = `${this.fileInput.offsetTop + this.fileInput.offsetHeight}px`;
    }

    // 检查文件是否存在
    checkFileExistence(fileName) {
        const file = this.app.vault.getFiles().find(file => file.basename === fileName);
        if (!file && fileName.trim()) {
            new obsidian.Notice(`文件 "${fileName}" 不存在。`);
        }
    }

    
    // 遮挡模式
    onCoverMode(coverMode){
        // 如果不遮挡，则返回
        // 0为遮挡卡片上面，1为遮挡下面
        // 通过修改css实现
        const carouselElA = document.getElementsByClassName('carousel-A')[0];
        const carouselElB = document.getElementsByClassName('carousel-B')[0];

        if (coverMode == -1){
            carouselElA.style.opacity = '1';
            carouselElB.style.opacity = '1';
        }else if(coverMode == 0){
            carouselElA.style.opacity = '0';
            carouselElB.style.opacity = '1';
        }else if(coverMode == 1){
            carouselElA.style.opacity = '1';
            carouselElB.style.opacity = '0';
        }
    }
}


// 导出插件
module.exports = FlowCardsPlugin;