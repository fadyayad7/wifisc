import ExpoModulesCore

public class ArpModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Arp")

    // Synchronous on purpose: a sysctl read takes microseconds, so a promise
    // would cost more than the work it wraps.
    Function("getArpTable") { () -> [String: String] in
      ArpReader.read()
    }
  }
}
