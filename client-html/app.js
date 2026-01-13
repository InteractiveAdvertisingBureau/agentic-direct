/**
 * A2A Agent Test Client
 * Standalone browser client for testing A2A Protocol agents
 */

class A2AClient {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.currentAgent = 'buyer';
        this.agentCard = null;
        this.tasks = new Map();
        this.requestId = 1;

        this.initializeUI();
    }

    initializeUI() {
        // Connect button
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());

        // Agent selection
        document.querySelectorAll('input[name="agent"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentAgent = e.target.value;
                this.agentCard = null;
                document.getElementById('agentInfo').style.display = 'none';
                document.getElementById('sendBtn').disabled = true;
            });
        });

        // Send message
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());

        // Enter key to send
        document.getElementById('messageInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Quick action buttons
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const message = e.target.dataset.message;
                document.getElementById('messageInput').value = message;
                this.sendMessage();
            });
        });

        // Clear debug log
        document.getElementById('clearDebugBtn').addEventListener('click', () => {
            document.getElementById('debugLog').innerHTML = '';
        });

        // Update server URL
        document.getElementById('serverUrl').addEventListener('change', (e) => {
            this.serverUrl = e.target.value;
        });
    }

    async connect() {
        const btn = document.getElementById('connectBtn');
        btn.disabled = true;
        btn.innerHTML = 'Connecting... <span class="loading"></span>';

        try {
            this.log('info', `Connecting to ${this.currentAgent} agent at ${this.serverUrl}`);

            // Fetch agent card
            const agentCardUrl = `${this.serverUrl}/a2a/${this.currentAgent}/.well-known/agent-card.json`;
            this.log('info', `Fetching agent card: ${agentCardUrl}`);

            const response = await fetch(agentCardUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch agent card: ${response.status} ${response.statusText}`);
            }

            this.agentCard = await response.json();
            this.log('info', `Connected to agent: ${this.agentCard.name}`);

            // Display agent info
            this.displayAgentInfo();

            // Enable send button
            document.getElementById('sendBtn').disabled = false;

            this.addSystemMessage(`✅ Connected to ${this.agentCard.name}`);

        } catch (error) {
            this.log('error', `Connection failed: ${error.message}`);
            this.addSystemMessage(`❌ Connection failed: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Connect';
        }
    }

    displayAgentInfo() {
        const infoDiv = document.getElementById('agentInfo');
        const detailsDiv = document.getElementById('agentDetails');

        const skills = this.agentCard.skills.map(s => s.name).join(', ');
        const protocols = this.agentCard.additionalInterfaces.map(i => i.protocol).join(', ');

        detailsDiv.innerHTML = `
            <div class="detail-item">
                <span class="detail-label">Name:</span> ${this.agentCard.name}
            </div>
            <div class="detail-item">
                <span class="detail-label">Protocol Version:</span> ${this.agentCard.protocolVersion}
            </div>
            <div class="detail-item">
                <span class="detail-label">Skills:</span> ${skills}
            </div>
            <div class="detail-item">
                <span class="detail-label">Supported Protocols:</span> ${protocols}
            </div>
            <div class="detail-item">
                <span class="detail-label">Streaming:</span> ${this.agentCard.capabilities.streaming ? '✅' : '❌'}
            </div>
        `;

        infoDiv.style.display = 'block';
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const messageText = input.value.trim();

        if (!messageText) return;
        if (!this.agentCard) {
            alert('Please connect to an agent first');
            return;
        }

        // Clear input
        input.value = '';

        // Add user message to chat
        this.addUserMessage(messageText);

        try {
            this.log('info', `Sending message: "${messageText}"`);

            // Create A2A message
            const message = {
                messageId: this.generateId(),
                role: 'user',
                parts: [{
                    kind: 'text',
                    text: messageText
                }],
                kind: 'message'
            };

            // Send via JSON-RPC
            const endpoint = `${this.serverUrl}/a2a/${this.currentAgent}/jsonrpc`;
            const rpcRequest = {
                jsonrpc: '2.0',
                method: 'sendMessage',
                params: { message },
                id: this.requestId++
            };

            this.log('info', `JSON-RPC request to ${endpoint}`);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rpcRequest)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.error) {
                throw new Error(`JSON-RPC Error: ${result.error.message}`);
            }

            this.log('info', `Response received: ${JSON.stringify(result.result)}`);

            // Handle response
            const taskData = result.result;
            if (taskData) {
                this.handleTask(taskData);
            }

        } catch (error) {
            this.log('error', `Failed to send message: ${error.message}`);
            this.addSystemMessage(`❌ Error: ${error.message}`);
        }
    }

    handleTask(task) {
        this.log('info', `Task created: ${task.id}, status: ${task.status.state}`);

        // Store task
        this.tasks.set(task.id, task);

        // Add to task list
        this.updateTaskList();

        // If task has agent response in history, show it
        if (task.history && task.history.length > 1) {
            const agentMessages = task.history.filter(h => h.role === 'agent');
            agentMessages.forEach(msg => {
                const textParts = msg.parts?.filter(p => p.kind === 'text') || [];
                const text = textParts.map(p => p.text).join('\n');

                const dataParts = msg.parts?.filter(p => p.kind === 'data') || [];
                const data = dataParts.length > 0 ? dataParts[0].data : null;

                if (text) {
                    this.addAgentMessage(text, data);
                }
            });
        }

        // Poll for completion if still working
        if (task.status.state === 'working') {
            this.pollTask(task.id);
        }
    }

    async pollTask(taskId) {
        const maxAttempts = 30;
        let attempts = 0;

        // Track how many agent messages we've already shown
        let shownAgentMessages = 0;
        const existingTask = this.tasks.get(taskId);
        if (existingTask?.history) {
            shownAgentMessages = existingTask.history.filter(h => h.role === 'agent').length;
        }

        const poll = async () => {
            if (attempts++ >= maxAttempts) {
                this.log('error', `Task ${taskId} polling timeout`);
                return;
            }

            try {
                const endpoint = `${this.serverUrl}/a2a/${this.currentAgent}/jsonrpc`;
                const rpcRequest = {
                    jsonrpc: '2.0',
                    method: 'getTask',
                    params: { taskId },
                    id: this.requestId++
                };

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(rpcRequest)
                });

                const result = await response.json();
                if (result.error) {
                    throw new Error(result.error.message);
                }

                const task = result.result;

                // Update task in map
                this.tasks.set(taskId, task);
                this.updateTaskList();

                // Check for new agent messages
                const agentMessages = task.history.filter(h => h.role === 'agent');

                if (agentMessages.length > shownAgentMessages) {
                    const newMessages = agentMessages.slice(shownAgentMessages);
                    this.log('info', `Found ${newMessages.length} new agent messages`);

                    newMessages.forEach(msg => {
                        // Extract text parts
                        const textParts = msg.parts?.filter(p => p.kind === 'text') || [];
                        const text = textParts.map(p => p.text).join('\n');

                        // Extract data parts
                        const dataParts = msg.parts?.filter(p => p.kind === 'data') || [];
                        const data = dataParts.length > 0 ? dataParts[0].data : null;

                        if (text) {
                            this.addAgentMessage(text, data);
                        }
                    });

                    shownAgentMessages = agentMessages.length;
                }

                if (task.status.state === 'completed') {
                    this.log('info', `Task ${taskId} completed`);
                } else if (task.status.state === 'failed') {
                    this.log('error', `Task ${taskId} failed: ${task.status.message || 'Unknown error'}`);
                    this.addSystemMessage(`❌ Task failed: ${task.status.message || 'Unknown error'}`);
                } else if (task.status.state === 'working') {
                    // Continue polling
                    setTimeout(poll, 1000);
                }

            } catch (error) {
                this.log('error', `Failed to poll task ${taskId}: ${error.message}`);
            }
        };

        poll();
    }

    updateTaskList() {
        const listDiv = document.getElementById('taskList');

        if (this.tasks.size === 0) {
            listDiv.innerHTML = '<div class="empty-state">No active tasks</div>';
            return;
        }

        listDiv.innerHTML = '';

        // Show tasks in reverse chronological order
        const taskArray = Array.from(this.tasks.values()).reverse();
        taskArray.forEach(task => {
            const taskDiv = document.createElement('div');
            taskDiv.className = 'task-item';

            const userMessage = task.history.find(h => h.role === 'user');
            const userText = userMessage?.parts?.[0]?.text || 'No message';

            taskDiv.innerHTML = `
                <div class="task-header">
                    <span class="task-id">🆔 ${task.id.substring(0, 8)}...</span>
                    <span class="task-status status-${task.status.state}">${task.status.state}</span>
                </div>
                <div class="task-content">
                    <strong>Request:</strong> ${userText}
                </div>
            `;

            listDiv.appendChild(taskDiv);
        });
    }

    addUserMessage(text) {
        this.addMessage('user', '👤 You', text);
    }

    addAgentMessage(text, data = null) {
        this.addMessage('agent', '🤖 Agent', text, data);
    }

    addSystemMessage(text) {
        this.addMessage('system', '⚙️ System', text);
    }

    addMessage(type, header, text, data = null) {
        const messagesDiv = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${type}`;

        const dataHtml = data ? `
            <details class="message-data">
                <summary>📊 Response Data</summary>
                <pre>${this.escapeHtml(JSON.stringify(data, null, 2))}</pre>
            </details>
        ` : '';

        messageDiv.innerHTML = `
            <div class="message-header">${header}</div>
            <div class="message-content">${this.escapeHtml(text)}</div>
            ${dataHtml}
        `;

        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    log(level, message) {
        const logDiv = document.getElementById('debugLog');
        const entry = document.createElement('div');
        entry.className = `debug-entry debug-${level}`;

        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `<span class="debug-timestamp">[${timestamp}]</span> ${this.escapeHtml(message)}`;

        logDiv.appendChild(entry);
        logDiv.scrollTop = logDiv.scrollHeight;

        // Also log to console
        console.log(`[${level.toUpperCase()}] ${message}`);
    }

    generateId() {
        return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the client when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.a2aClient = new A2AClient();
    console.log('A2A Test Client initialized');
});
