param prefix string
param location string
param tags object
param adminUsername string = 'mailwarm'

@secure()
param adminSshPublicKey string

// Cloud-init: install Docker and create the /opt/mailwarm working directory.
// The actual docker-compose and app configs are deployed by the CI pipeline via SSH.
var cloudInit = '''
#cloud-config
package_update: true
packages:
  - docker.io
  - docker-compose-plugin
runcmd:
  - systemctl enable docker
  - systemctl start docker
  - mkdir -p /opt/mailwarm
  - usermod -aG docker mailwarm
'''

// ── Public IP ─────────────────────────────────────────────────────────────────
resource publicIp 'Microsoft.Network/publicIPAddresses@2023-05-01' = {
  name: '${prefix}-mta-ip'
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: {
    publicIPAllocationMethod: 'Static'
    dnsSettings: { domainNameLabel: '${prefix}-mta' }
  }
}

// ── NSG ───────────────────────────────────────────────────────────────────────
resource nsg 'Microsoft.Network/networkSecurityGroups@2023-05-01' = {
  name: '${prefix}-mta-nsg'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'allow-ssh'
        properties: { priority: 100, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: '*', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '22' }
      }
      {
        name: 'allow-smtp'
        properties: { priority: 110, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: '*', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '25' }
      }
      {
        name: 'allow-submission'
        properties: { priority: 120, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: '*', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '587' }
      }
      {
        name: 'allow-smtps'
        properties: { priority: 130, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: '*', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '465' }
      }
      {
        name: 'allow-imaps'
        properties: { priority: 140, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: '*', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '993' }
      }
    ]
  }
}

// ── VNet + Subnet ─────────────────────────────────────────────────────────────
resource vnet 'Microsoft.Network/virtualNetworks@2023-05-01' = {
  name: '${prefix}-mta-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.1.0.0/24'] }
    subnets: [{
      name: 'default'
      properties: {
        addressPrefix: '10.1.0.0/24'
        networkSecurityGroup: { id: nsg.id }
      }
    }]
  }
}

// ── NIC ───────────────────────────────────────────────────────────────────────
resource nic 'Microsoft.Network/networkInterfaces@2023-05-01' = {
  name: '${prefix}-mta-nic'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [{
      name: 'ipconfig1'
      properties: {
        privateIPAllocationMethod: 'Dynamic'
        publicIPAddress: { id: publicIp.id }
        subnet: { id: '${vnet.id}/subnets/default' }
      }
    }]
  }
}

// ── VM ────────────────────────────────────────────────────────────────────────
resource vm 'Microsoft.Compute/virtualMachines@2023-09-01' = {
  name: '${prefix}-mta-vm'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    hardwareProfile: { vmSize: 'Standard_B2s' }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: { storageAccountType: 'Standard_LRS' }
        diskSizeGB: 30
      }
    }
    osProfile: {
      computerName: '${prefix}-mta'
      adminUsername: adminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [{
            path: '/home/${adminUsername}/.ssh/authorized_keys'
            keyData: adminSshPublicKey
          }]
        }
      }
      customData: base64(cloudInit)
    }
    networkProfile: {
      networkInterfaces: [{ id: nic.id }]
    }
  }
}

output publicIpAddress string = publicIp.properties.ipAddress
output principalId string = vm.identity.principalId
output vmName string = vm.name
