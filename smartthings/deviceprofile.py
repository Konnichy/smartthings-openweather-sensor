#!/usr/bin/env python3

import sys
import subprocess
import yaml

def run_smartthings(command):
    result = subprocess.run(f"smartthings {command}".split(), capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(result.stderr)
    return yaml.safe_load(result.stdout)

def create_deviceprofile(input_filename):
    result = run_smartthings(f'deviceprofiles:create --input {input_filename}')
    return result['id']

def create_deviceconfig(input_filename):
    result = run_smartthings(f'presentation:device-config:create --input {input_filename}')
    return (result['mnmn'], result['vid'])

def bind_deviceconfig_to_deviceprofile(deviceprofile_filename, deviceprofile_id, updated_mnmn, updated_vid):
    with open(deviceprofile_filename, 'r') as original_file:
        deviceprofile = yaml.safe_load(original_file)

    deviceprofile['metadata']['mnmn'] = updated_mnmn
    deviceprofile['metadata']['vid'] = updated_vid

    updated_deviceprofile_file = f'{deviceprofile_filename}.temp'
    with open(updated_deviceprofile_file, 'w') as updated_file:
        updated_file.write(yaml.dump(deviceprofile))

    result = run_smartthings(f'deviceprofiles:update {deviceprofile_id} --input {updated_deviceprofile_file}')

def create_full_deviceprofile(deviceprofile_filename, deviceconfig_filename):
    deviceprofile_id = create_deviceprofile(deviceprofile_filename)

    # The input file template was initially generated with the following command:
    # $ smartthings presentation:device-config:generate <deviceprofile_id> --output deviceconfig.yml
    # then manually edited to have the wanted dashboard states and actions.
    deviceconfig_mnmn, deviceconfig_vid = create_deviceconfig(deviceconfig_filename)

    bind_deviceconfig_to_deviceprofile(deviceprofile_filename, deviceprofile_id, deviceconfig_mnmn, deviceconfig_vid)

    return deviceprofile_id

def check_deviceprofile(deviceprofile_id):
    result = run_smartthings(f'deviceprofiles {deviceprofile_id} --yaml')
    vid = result['metadata']['vid']

    result = run_smartthings(f'presentation:device-config {vid} --yaml')
    print(yaml.dump(result))
    # WARNING: YAML sections are not displayed in the same order as returned by the SmartThings CLI

def publish_deviceprofile(deviceprofile_id):
    result = run_smartthings(f'deviceprofiles:publish {deviceprofile_id}')

if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] == 'create':
        deviceprofile_id = create_full_deviceprofile('deviceprofile.yml', 'deviceconfig.yml')
        check_deviceprofile(deviceprofile_id)
    elif len(sys.argv) == 3 and sys.argv[1] == 'check':
        deviceprofile_id = sys.argv[2]
        check_deviceprofile(deviceprofile_id)
    elif len(sys.argv) == 3 and sys.argv[1] == 'publish':
        deviceprofile_id = sys.argv[2]
        publish_deviceprofile(deviceprofile_id)
    else:
        print("Usage: {} create".format(sys.argv[0]))
        print("       {} check <device profile's id>".format(sys.argv[0]))
        print("       {} publish <device profile's id>".format(sys.argv[0]))
        exit(1)
