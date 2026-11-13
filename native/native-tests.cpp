#define PBZ_ROUTE_NATIVE_TEST
#include "QuestRouteCompat.cpp"
#include <cassert>
#include <iostream>

namespace {
RC::ModEvent_OnLuaStart callback{};
std::wstring executed;
}
namespace RC {
CppUserModBase::CppUserModBase() = default;
CppUserModBase::~CppUserModBase() = default;
void CppUserModBase::register_on_lua_start(ModEvent_OnLuaStart fn) { callback=fn; }
}
namespace RC::LuaMadeSimple {
Lua::Registry::Registry(const Lua& instance) : m_lua_instance(instance) {}
Lua::Lua(lua_State* state) : m_lua_state(state), m_registry(*this) {}
Lua::~Lua() = default;
void Lua::execute_file(std::wstring_view path) const { executed=path; }
}
int main(int argc, char** argv) {
    static_assert(sizeof(RC::CppUserModBase)==192, "UE4SS 1195 base layout changed");
    assert(argc==3);
    assert(sha256(argv[1])=="e1fb9a7e1d868afef6a091c2012e711c3ec47f05d100ba37f9631a4f75f31df2");
    test_root=module_file().parent_path()/"native-fixture"/"Mods"/"PBZQuestRouteCompat";
    std::filesystem::create_directories(test_root/"Scripts");
    assert(test_root.is_absolute() && test_root.filename()==L"PBZQuestRouteCompat");
    const auto fake_runtime=test_root.parent_path().parent_path()/"UE4SS.dll";
    { std::ofstream bad(fake_runtime); bad << "unsupported runtime"; }
    assert(!supported_runtime());
    std::filesystem::copy_file(argv[1],fake_runtime,std::filesystem::copy_options::overwrite_existing);
    assert(supported_runtime());
    QuestRouteCompat mod;
    assert(callback);
    RC::LuaMadeSimple::Lua lua(nullptr);
    callback(&mod,{L"OtherMod",8},lua,lua,lua,nullptr);
    assert(executed.empty());
    const auto tracker=test_root.parent_path()/"PbzMapTracker"/"Scripts"/"main.lua";
    std::filesystem::create_directories(tracker.parent_path());
    { std::ofstream bad(tracker); bad << "-- future collector entry; API compatibility is checked in Lua"; }
    const auto host=test_root/"Scripts"/"PBZTrackerHost.lua";
    callback(&mod,{L"PbzMapTracker",13},lua,lua,lua,nullptr);
    assert(executed==host.native());
    std::filesystem::copy_file(argv[2],tracker,
        std::filesystem::copy_options::overwrite_existing);
    std::filesystem::copy_file("Quest_Navigation_0.8.5/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts/PBZTrackerHost.lua",host,
        std::filesystem::copy_options::overwrite_existing);
    callback(&mod,{L"PbzMapTracker",13},lua,lua,lua,nullptr);
    assert(executed==host.native());
    std::cout << "PASS: native ABI size, runtime SHA gate, mod filtering, version-independent host dispatch\n";
}
