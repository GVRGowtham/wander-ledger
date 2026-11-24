require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LocalPdfRenderer'
  s.version        = package['version'] || '1.0.0'
  s.summary        = package['description'] || 'Offline PDF renderer and document picker using Apple PDFKit'
  s.description    = package['description'] || 'Offline PDF renderer and document picker using Apple PDFKit and UIDocumentPickerViewController'
  s.license        = package['license'] || 'MIT'
  s.author         = package['author'] || "Wanderer's Ledger"
  s.homepage       = package['homepage'] || 'https://github.com/GVRGowtham/wander-ledger'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/GVRGowtham/wander-ledger.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit', 'UIKit', 'UniformTypeIdentifiers'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
