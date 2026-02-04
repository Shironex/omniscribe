import { Injectable } from '@nestjs/common';

/**
 * Centralized registry for MCP session state.
 *
 * Consolidates session tracking that was previously scattered across
 * McpStatusServerService (sessionProjects) and McpGateway (sessionEnabled).
 * Provides the single source of truth for session-to-project mapping
 * and enabled server preferences.
 */
@Injectable()
export class McpSessionRegistryService {
  /** Maps session IDs to project paths for routing */
  private sessionProjects = new Map<string, string>();

  /** Maps session keys (projectPath:sessionId) to enabled server IDs */
  private sessionEnabled = new Map<string, string[]>();

  /**
   * Register a session for status updates
   * @param sessionId Session identifier
   * @param projectPath Project path for routing
   */
  registerSession(sessionId: string, projectPath: string): void {
    this.sessionProjects.set(sessionId, projectPath);
    console.log(
      `[McpSessionRegistry] Registered session ${sessionId} for project '${projectPath}'`
    );
  }

  /**
   * Unregister a session when it ends
   * @param sessionId Session identifier
   */
  unregisterSession(sessionId: string): void {
    const projectPath = this.sessionProjects.get(sessionId);
    if (this.sessionProjects.delete(sessionId)) {
      console.log(`[McpSessionRegistry] Unregistered session ${sessionId}`);
    }

    // Also clean up enabled servers for this session
    if (projectPath) {
      const sessionKey = `${projectPath}:${sessionId}`;
      this.sessionEnabled.delete(sessionKey);
    }
  }

  /**
   * Check if a session is registered
   * @param sessionId Session identifier
   * @returns True if session is registered
   */
  hasSession(sessionId: string): boolean {
    return this.sessionProjects.has(sessionId);
  }

  /**
   * Get the project path for a session
   * @param sessionId Session identifier
   * @returns Project path or undefined if not registered
   */
  getProjectPath(sessionId: string): string | undefined {
    return this.sessionProjects.get(sessionId);
  }

  /**
   * Get all registered session IDs
   * @returns Array of session IDs
   */
  getRegisteredSessions(): string[] {
    return Array.from(this.sessionProjects.keys());
  }

  /**
   * Set enabled servers for a session
   * @param projectPath Project path
   * @param sessionId Session identifier
   * @param serverIds Array of enabled server IDs
   */
  setEnabledServers(
    projectPath: string,
    sessionId: string,
    serverIds: string[]
  ): void {
    const sessionKey = `${projectPath}:${sessionId}`;
    this.sessionEnabled.set(sessionKey, serverIds);
    console.log(
      `[McpSessionRegistry] Set ${serverIds.length} enabled servers for session ${sessionId}`
    );
  }

  /**
   * Get enabled servers for a session
   * @param projectPath Project path
   * @param sessionId Session identifier
   * @returns Array of enabled server IDs (empty if not set)
   */
  getEnabledServers(projectPath: string, sessionId: string): string[] {
    const sessionKey = `${projectPath}:${sessionId}`;
    return this.sessionEnabled.get(sessionKey) ?? [];
  }

  /**
   * Clear enabled servers for a session
   * @param projectPath Project path
   * @param sessionId Session identifier
   */
  clearEnabledServers(projectPath: string, sessionId: string): void {
    const sessionKey = `${projectPath}:${sessionId}`;
    this.sessionEnabled.delete(sessionKey);
  }
}
