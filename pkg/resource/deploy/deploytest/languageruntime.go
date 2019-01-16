// Copyright 2016-2018, Pulumi Corporation.
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

package deploytest

import (
	"github.com/pkg/errors"
	"google.golang.org/grpc"

	"github.com/pulumi/pulumi/pkg/resource/plugin"
	"github.com/pulumi/pulumi/pkg/workspace"
	pulumirpc "github.com/pulumi/pulumi/sdk/proto/go"
)

type ProgramFunc func(runInfo plugin.RunInfo, monitor *ResourceMonitor) error

type LanguageRuntimeOption func(*languageRuntime)

func RequiredPlugin(info workspace.PluginInfo) LanguageRuntimeOption {
	return func(r *languageRuntime) {
		r.requiredPlugins = append(r.requiredPlugins, info)
	}
}

func EnableSecrets(enable bool) LanguageRuntimeOption {
	return func(r *languageRuntime) {
		r.enableSecrets = enable
	}
}

func NewLanguageRuntime(program ProgramFunc, options ...LanguageRuntimeOption) plugin.LanguageRuntime {
	r := &languageRuntime{
		program: program,
	}
	for _, o := range options {
		o(r)
	}
	return r
}

type languageRuntime struct {
	requiredPlugins []workspace.PluginInfo
	program         ProgramFunc
	enableSecrets   bool
}

func (p *languageRuntime) Close() error {
	return nil
}

func (p *languageRuntime) GetRequiredPlugins(info plugin.ProgInfo) ([]workspace.PluginInfo, error) {
	return p.requiredPlugins, nil
}

func (p *languageRuntime) Run(info plugin.RunInfo) (string, error) {
	// Connect to the resource monitor and create an appropriate client.
	conn, err := grpc.Dial(info.MonitorAddress, grpc.WithInsecure())
	if err != nil {
		return "", errors.Wrapf(err, "could not connect to resource monitor")
	}

	// Fire up a resource monitor client
	resmon := pulumirpc.NewResourceMonitorClient(conn)

	// Run the program.
	done := make(chan error)
	go func() {
		done <- p.program(info, &ResourceMonitor{resmon: resmon, enableSecrets: p.enableSecrets})
	}()
	if progerr := <-done; progerr != nil {
		return progerr.Error(), nil
	}
	return "", nil
}

func (p *languageRuntime) GetPluginInfo() (workspace.PluginInfo, error) {
	return workspace.PluginInfo{Name: "TestLanguage"}, nil
}
