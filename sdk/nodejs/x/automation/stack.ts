// Copyright 2016-2020, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { CommandResult, runPulumiCmd } from "./cmd";
import { ConfigMap, ConfigValue } from "./config";
import { PulumiFn, Workspace } from "./workspace";

export type StackInitMode = "create" | "select" | "upsert";

export class Stack {
    ready: Promise<any>;
    private name: string;
    private workspace: Workspace;
    public static async Create(name: string, workspace: Workspace): Promise<Stack> {
        const stack = new Stack(name, workspace, "create");
        await stack.ready;
        return Promise.resolve(stack);
    }
    public static async Select(name: string, workspace: Workspace): Promise<Stack> {
        const stack = new Stack(name, workspace, "select");
        await stack.ready;
        return Promise.resolve(stack);
    }
    public static async Upsert(name: string, workspace: Workspace): Promise<Stack> {
        const stack = new Stack(name, workspace, "upsert");
        await stack.ready;
        return Promise.resolve(stack);
    }
    constructor(name: string, workspace: Workspace, mode: StackInitMode) {
        this.name = name;
        this.workspace = workspace;

        switch (mode) {
            case "create":
                this.ready = workspace.createStack(name);
                return this;
            case "select":
                this.ready = workspace.selectStack(name);
                return this;
            case "upsert":
                // TODO update this based on structured errors (check for 409)
                this.ready = workspace.createStack(name).catch(() => {
                    return workspace.selectStack(name);
                });
                return this;
            default:
                throw new Error(`unexpected Stack creation mode: ${mode}`);
        }
    }
    async up(opts?: UpOptions): Promise<UpResult> {
        const args = ["up", "--yes", "--skip-preview"];
        let kind = execKind.local;
        let program: PulumiFn | undefined = this.workspace.getProgram();
        await this.workspace.selectStack(this.name);

        if (opts) {
            if (opts.program) {
                program = opts.program;
            }
            if (opts.message) {
                args.push("--message", opts.message);
            }
            if (opts.expectNoChanges) {
                args.push("--expect-no-changes");
            }
            if (opts.replace) {
                for (const rURN of opts.replace) {
                    args.push("--replace", rURN);
                }
            }
            if (opts.target) {
                for (const tURN of opts.target) {
                    args.push("--target", tURN);
                }
            }
            if (opts.targetDependents) {
                args.push("--target-dependents");
            }
            if (opts.parallel) {
                args.push("--parallel", opts.parallel.toString());
            }
        }

        if (program) {
            kind = execKind.inline;
            // TODO: inline program execution, setup server, add client args, etc.
            throw new Error("NYI: inline programs");
        }

        args.push("--exec-kind", kind);
        const upResult = await this.runPulumiCmd(args, opts?.onOutput);
        const status = await Promise.all([this.info(), this.outputs()]);
        const result: UpResult = {
            stdout: upResult.stdout,
            stderr: upResult.stderr,
            summary: status[0]!,
            outputs: status[1]!,
        };
        return Promise.resolve(result);
    }
    async preview(opts?: PreviewOptions): Promise<PreviewResult> {
        // TODO JSON
        const args = ["preview"];
        let kind = execKind.local;
        let program: PulumiFn | undefined = this.workspace.getProgram();
        await this.workspace.selectStack(this.name);

        if (opts) {
            if (opts.program) {
                program = opts.program;
            }
            if (opts.message) {
                args.push("--message", opts.message);
            }
            if (opts.expectNoChanges) {
                args.push("--expect-no-changes");
            }
            if (opts.replace) {
                for (const rURN of opts.replace) {
                    args.push("--replace", rURN);
                }
            }
            if (opts.target) {
                for (const tURN of opts.target) {
                    args.push("--target", tURN);
                }
            }
            if (opts.targetDependents) {
                args.push("--target-dependents");
            }
            if (opts.parallel) {
                args.push("--parallel", opts.parallel.toString());
            }
        }

        if (program) {
            kind = execKind.inline;
            // TODO: inline program execution, setup server, add client args, etc.
            throw new Error("NYI: inline programs");
        }

        args.push("--exec-kind", kind);
        const preResult = await this.runPulumiCmd(args);
        const summary = await this.info();
        const result: PreviewResult = {
            stdout: preResult.stdout,
            stderr: preResult.stderr,
            summary: summary!,
        };
        return Promise.resolve(result);
    }
    async refresh(opts?: RefreshOptions): Promise<RefreshResult> {
        const args = ["refresh", "--yes", "--skip-preview"];
        await this.workspace.selectStack(this.name);

        if (opts) {
            if (opts.message) {
                args.push("--message", opts.message);
            }
            if (opts.expectNoChanges) {
                args.push("--expect-no-changes");
            }
            if (opts.target) {
                for (const tURN of opts.target) {
                    args.push("--target", tURN);
                }
            }
            if (opts.parallel) {
                args.push("--parallel", opts.parallel.toString());
            }
        }

        const refResult = await this.runPulumiCmd(args);
        const summary = await this.info();
        const result: RefreshResult = {
            stdout: refResult.stdout,
            stderr: refResult.stderr,
            summary: summary!,
        };
        return Promise.resolve(result);
    }
    async destroy(opts?: DestroyOptions): Promise<DestroyResult> {
        const args = ["destroy", "--yes", "--skip-preview"];
        await this.workspace.selectStack(this.name);

        if (opts) {
            if (opts.message) {
                args.push("--message", opts.message);
            }
            if (opts.target) {
                for (const tURN of opts.target) {
                    args.push("--target", tURN);
                }
            }
            if (opts.targetDependents) {
                args.push("--target-dependents");
            }
            if (opts.parallel) {
                args.push("--parallel", opts.parallel.toString());
            }
        }

        const preResult = await this.runPulumiCmd(args);
        const summary = await this.info();
        const result: DestroyResult = {
            stdout: preResult.stdout,
            stderr: preResult.stderr,
            summary: summary!,
        };
        return Promise.resolve(result);
    }
    getName(): string { return this.name; }
    getWorkspace(): Workspace { return this.workspace; }
    async getConfig(key: string): Promise<ConfigValue> {
        return this.workspace.getConfig(this.name, key);
    }
    async getAllConfig(): Promise<ConfigMap> {
        return this.workspace.getAllConfig(this.name);
    }
    async setConfig(key: string, value: ConfigValue): Promise<void> {
        return this.workspace.setConfig(this.name, key, value);
    }
    async setAllConfig(config: ConfigMap): Promise<void> {
        return this.workspace.setAllConfig(this.name, config);
    }
    async removeConfig(key: string): Promise<void> {
        return this.workspace.removeConfig(this.name, key);
    }
    async removeAllConfig(keys: string[]): Promise<void> {
        return this.workspace.removeAllConfig(this.name, keys);
    }
    async refreshConfig(): Promise<ConfigMap> {
        return this.workspace.refreshConfig(this.name);
    }
    async outputs(): Promise<OutputMap> {
        await this.workspace.selectStack(this.name);
        const maskedPromise = this.runPulumiCmd(["stack", "output", "--json"]);
        const plaintextPromise = this.runPulumiCmd(["stack", "output", "--json", "--show-secrets"]);
        const results = await Promise.all([maskedPromise, plaintextPromise]);
        const maskedOuts = JSON.parse(results[0].stdout);
        const plaintextOuts = JSON.parse(results[1].stdout);
        const outputs: OutputMap = {};
        const secretSentinal = "[secret]";
        for (const [key, value] of Object.entries(plaintextOuts)) {
            const secret = maskedOuts[key] === secretSentinal;
            outputs[key] = { value, secret };
        }

        return Promise.resolve(outputs);
    }
    async history(): Promise<UpdateSummary[]> {
        const result = await this.runPulumiCmd(["history", "--json", "--show-secrets"]);
        const summaries: UpdateSummary[] = JSON.parse(result.stdout);
        return Promise.resolve(summaries);
    }
    async info(): Promise<UpdateSummary | undefined> {
        const history = await this.history();
        if (!history || history.length === 0) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve(history[0]);
    }
    private async runPulumiCmd(args: string[], onOutput?: (out: string) => void): Promise<CommandResult> {
        const ws = this.getWorkspace();
        let envs: { [key: string]: string } = {};
        const pulumiHome = ws.getPulumiHome();
        if (pulumiHome) {
            envs["PULUMI_HOME"] = pulumiHome;
        }
        const additionalEnvs = await ws.getEnvVars();
        envs = { ...envs, ...additionalEnvs };
        const additionalArgs = await ws.serializeArgsForOp(this.name);
        args = [...args, ...additionalArgs];
        const result = await runPulumiCmd(args, ws.getWorkDir(), envs, onOutput);
        await ws.postCommandCallback(this.name);
        return Promise.resolve(result);
    }
}

export function FullyQualifiedStackName(org: string, project: string, stack: string): string {
    return `${org}/${project}/${stack}`;
}

export type OutputValue = {
    value: any;
    secret: boolean;
};

export type OutputMap = { [key: string]: OutputValue };

export type UpdateSummary = {
    // pre-update info
    kind: UpdateKind;
    startTime: number;
    message: string;
    environment: { [key: string]: string };
    config: ConfigMap;

    // post-update info
    result: UpdateResult;
    endTime: number;
    version: number;
    Deployment?: RawJSON;
    resourceChanges?: OpMap;
};

export type UpdateKind = "update" | "preview" | "refresh" | "rename" | "destroy" | "import";

export type UpdateResult = "not-started" | "in-progress" | "succeeded" | "failed";

export type OpType = "same" | "create" | "update" | "delete" | "replace" | "create-replacement" | "delete-replaced";

export type OpMap = {
    [key in OpType]: number;
};

export type RawJSON = string;

export type UpResult = {
    stdout: string;
    stderr: string;
    outputs: OutputMap;
    summary: UpdateSummary;
};

export type PreviewResult = {
    stdout: string;
    stderr: string;
    summary: UpdateSummary;
};

export type RefreshResult = {
    stdout: string;
    stderr: string;
    summary: UpdateSummary;
};

export type DestroyResult = {
    stdout: string;
    stderr: string;
    summary: UpdateSummary;
};

export type UpOptions = {
    parallel?: number;
    message?: string;
    expectNoChanges?: boolean;
    replace?: string[];
    target?: string[];
    targetDependents?: boolean;
    onOutput?: (out: string) => void;
    program?: PulumiFn;
};

export type PreviewOptions = {
    parallel?: number;
    message?: string;
    expectNoChanges?: boolean;
    replace?: string[];
    target?: string[];
    targetDependents?: boolean;
    program?: PulumiFn;
};

export type RefreshOptions = {
    parallel?: number;
    message?: string;
    expectNoChanges?: boolean;
    target?: string[];
    onOutput?: (out: string) => void;
};

export type DestroyOptions = {
    parallel?: number;
    message?: string;
    target?: string[];
    targetDependents?: boolean;
    onOutput?: (out: string) => void;
};

const execKind = {
    local: "auto.local",
    inline: "auto.inline",
};