Pod::Spec.new do |s|
  s.name           = 'Arp'
  s.version        = '1.0.0'
  s.summary        = 'Reads the kernel ARP cache to map LAN IPs to MAC addresses'
  s.description    = s.summary
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '13.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files       = "**/*.{h,m,mm,swift,hpp,cpp}"
  # Public so the Swift half of this pod can see ArpReader through the umbrella header.
  s.public_header_files = "**/*.h"
end
