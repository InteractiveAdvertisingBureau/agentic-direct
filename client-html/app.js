/**
 * A2A Agent Test Client
 * Standalone browser client for testing A2A Protocol agents
 */

class A2AClient {
    constructor() {
        this.serverUrl = '';
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
            this.serverUrl = e.target.value.trim().replace(/\/+$/, '');
        });
    }

    async connect() {
        const btn = document.getElementById('connectBtn');
        btn.disabled = true;
        btn.innerHTML = 'Connecting... <span class="loading"></span>';

        // Get server URL from input field and remove trailing slash
        this.serverUrl = document.getElementById('serverUrl').value.trim().replace(/\/+$/, '');

        if (!this.serverUrl) {
            this.log('error', 'Server URL is required');
            this.addSystemMessage('❌ Please enter a server URL');
            btn.disabled = false;
            btn.textContent = 'Connect';
            return;
        }

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
                method: 'message/send',  // A2A v0.3.0 official method name
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

            // Debug: Log full response structure
            console.log('Full SDK response:', result);
            this.log('info', `Response received: ${JSON.stringify(result.result)}`);

            // Handle response - SDK returns either Message or Task
            const responseData = result.result;
            if (responseData) {
                this.log('info', `Response kind: ${responseData.kind}, has status: ${!!responseData.status}, has history: ${!!responseData.history}`);

                // Check if it's a Task (has status) or Message (has parts)
                if (responseData.kind === 'task') {
                    this.log('info', 'Handling as Task');
                    this.handleTask(responseData);
                } else if (responseData.kind === 'message') {
                    // SDK returned immediate Message (operation completed quickly)
                    this.log('info', 'Received immediate message response - creating task representation');

                    // Create a pseudo-task for display purposes
                    const pseudoTask = {
                        kind: 'task',
                        id: responseData.taskId,
                        contextId: responseData.contextId,
                        status: {
                            state: 'completed'
                        },
                        history: [
                            message, // Original user message
                            responseData // Agent's response message
                        ]
                    };

                    // handleTask will process the history and display the agent message
                    this.handleTask(pseudoTask);
                } else {
                    this.log('error', `Unknown response type: ${responseData.kind || 'no kind'}`);
                }
            } else {
                this.log('error', 'No response data received');
            }

        } catch (error) {
            this.log('error', `Failed to send message: ${error.message}`);
            this.addSystemMessage(`❌ Error: ${error.message}`);
        }
    }

    handleTask(task) {
        // Debug: Log full task structure
        console.log('=== handleTask called ===');
        console.log('Task ID:', task.id);
        console.log('Task status:', task.status);
        console.log('Task history length:', task.history?.length);

        // Defensive check for task structure
        if (!task || !task.status) {
            this.log('error', `Invalid task structure: ${JSON.stringify(task)}`);
            return;
        }

        this.log('info', `Task: ${task.id}, status: ${task.status.state}`);

        // Check if we've already processed this task
        const existingTask = this.tasks.get(task.id);
        const existingAgentMessageCount = existingTask?.history?.filter(h => h.role === 'agent').length || 0;
        const newAgentMessageCount = task.history?.filter(h => h.role === 'agent').length || 0;

        console.log('Existing agent messages:', existingAgentMessageCount);
        console.log('New agent messages:', newAgentMessageCount);

        // Store task BEFORE displaying messages
        this.tasks.set(task.id, task);
        this.log('info', `Task stored. Total tasks: ${this.tasks.size}`);

        // Add to task list
        this.updateTaskList();

        // Only show NEW agent messages (not already displayed)
        if (task.history && newAgentMessageCount > existingAgentMessageCount) {
            const agentMessages = task.history.filter(h => h.role === 'agent');
            const newMessages = agentMessages.slice(existingAgentMessageCount);

            console.log('Will display', newMessages.length, 'new messages');
            this.log('info', `Displaying ${newMessages.length} new agent messages (${existingAgentMessageCount} already shown)`);

            newMessages.forEach((msg, index) => {
                console.log(`Displaying message ${index + 1}:`, msg.parts?.[0]?.text?.substring(0, 50));

                const textParts = msg.parts?.filter(p => p.kind === 'text') || [];
                const text = textParts.map(p => p.text).join('\n');

                const dataParts = msg.parts?.filter(p => p.kind === 'data') || [];
                const data = dataParts.length > 0 ? dataParts[0].data : null;

                if (text) {
                    this.addAgentMessage(text, data);
                }
            });
        } else {
            console.log('No new messages to display');
        }

        // Poll for completion if still working
        if (task.status && task.status.state === 'working') {
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
                    method: 'task/get',  // A2A v0.3.0 official method name
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

                // Validate task structure
                if (!task || !task.status) {
                    this.log('error', `Invalid task structure from poll: ${JSON.stringify(task)}`);
                    return;
                }

                // Update task in map
                this.tasks.set(taskId, task);
                this.updateTaskList();

                // Check for new agent messages
                const agentMessages = task.history?.filter(h => h.role === 'agent') || [];

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
        console.log('updateTaskList called. Tasks count:', this.tasks.size);

        if (this.tasks.size === 0) {
            listDiv.innerHTML = '<div class="empty-state">No active tasks</div>';
            this.log('info', 'No tasks to display');
            return;
        }

        listDiv.innerHTML = '';

        // Show tasks in reverse chronological order
        const taskArray = Array.from(this.tasks.values()).reverse();
        console.log('Task array:', taskArray);
        taskArray.forEach(task => {
            // Skip tasks with invalid structure
            if (!task || !task.status) {
                return;
            }

            const taskDiv = document.createElement('div');
            taskDiv.className = 'task-item';

            const userMessage = task.history?.find(h => h.role === 'user');
            const userText = userMessage?.parts?.[0]?.text || 'No message';
            const statusState = task.status?.state || 'unknown';

            taskDiv.innerHTML = `
                <div class="task-header">
                    <span class="task-id">🆔 ${task.id.substring(0, 8)}...</span>
                    <span class="task-status status-${statusState}">${statusState}</span>
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
        return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
