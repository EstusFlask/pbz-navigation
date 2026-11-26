#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <Windows.h>
#include <bcrypt.h>
#include <Mod/CppUserModBase.hpp>
#include <LuaMadeSimple/LuaMadeSimple.hpp>
#include <algorithm>
#include <array>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string_view>

namespace {
HMODULE module_handle{};
#ifdef PBZ_ROUTE_NATIVE_TEST
std::filesystem::path test_root;
#endif
std::filesystem::path module_file() {
    std::wstring path(32768, L'\0');
    const auto size = GetModuleFileNameW(module_handle, path.data(), static_cast<DWORD>(path.size()));
    if (!size || size >= path.size()) throw std::runtime_error("module path unavailable");
    path.resize(size); return path;
}
std::filesystem::path own_root() {
#ifdef PBZ_ROUTE_NATIVE_TEST
    if (!test_root.empty()) return test_root;
#endif
    return module_file().parent_path().parent_path();
}
void status(const char* message) noexcept {
    OutputDebugStringA(message);
    try { std::ofstream(own_root() / "PBZQuestRouteCompat-status.txt", std::ios::app) << message << '\n'; }
    catch (...) {}
}
std::string sha256(const std::filesystem::path& file) {
    std::ifstream input(file, std::ios::binary);
    if (!input) return {};
    BCRYPT_ALG_HANDLE algorithm{}; BCRYPT_HASH_HANDLE hash{};
    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return {};
    if (BCryptCreateHash(algorithm, &hash, nullptr, 0, nullptr, 0, 0) < 0) {
        BCryptCloseAlgorithmProvider(algorithm, 0); return {};
    }
    std::array<unsigned char, 65536> buffer{}; bool ok = true;
    while (input) {
        input.read(reinterpret_cast<char*>(buffer.data()), buffer.size());
        if (BCryptHashData(hash, buffer.data(), static_cast<ULONG>(input.gcount()), 0) < 0) { ok=false; break; }
    }
    std::array<unsigned char, 32> digest{};
    ok = ok && input.eof() && BCryptFinishHash(hash, digest.data(), static_cast<ULONG>(digest.size()), 0) >= 0;
    BCryptDestroyHash(hash); BCryptCloseAlgorithmProvider(algorithm, 0);
    if (!ok) return {};
    std::string result; const char* digits="0123456789abcdef";
    for (auto byte : digest) { result += digits[byte >> 4]; result += digits[byte & 15]; }
    return result;
}
constexpr std::array<std::string_view, 2> kSupportedRuntimeHashes{
    "e1fb9a7e1d868afef6a091c2012e711c3ec47f05d100ba37f9631a4f75f31df2", // UE4SS v3.0.1-1195-g1ceefac8 Shipping
    "3843d81a8280096b0de3c750eebf15507e374c250dc551cbf07e7be7acc1e2ba", // UE4SS v4.0.0 #30afe5ff Shipping
};
bool is_supported_runtime_hash(const std::string& digest) {
    return std::find(kSupportedRuntimeHashes.begin(), kSupportedRuntimeHashes.end(), digest) != kSupportedRuntimeHashes.end();
}
bool supported_runtime() {
    const auto root=own_root().parent_path().parent_path();
    return is_supported_runtime_hash(sha256(root / "UE4SS.dll"));
}
class QuestRouteCompat final : public RC::CppUserModBase {
    static void lua_started(RC::CppUserModBase*, RC::CStringView name,
        RC::LuaMadeSimple::Lua&, RC::LuaMadeSimple::Lua& main,
        RC::LuaMadeSimple::Lua&, RC::LuaMadeSimple::Lua*) noexcept {
        const std::wstring_view target(name.data, name.size);
        const wchar_t* filename = target == L"PbzMapTracker" ? L"PBZTrackerHost.lua"
            : target == L"PbzModConfig" ? L"PBZModConfigHost.lua" : nullptr;
        if (!filename) return;
        try {
            // Each host checks its Lua module contracts inside the owning VM.
            const auto script=own_root() / "Scripts" / filename;
            main.execute_file(std::wstring_view(script.native()));
            status("Navigation compatibility host attached; no companion mod files were written.");
        } catch (const std::exception& e) { status(e.what()); }
        catch (...) { status("Navigation compatibility host could not attach."); }
    }
public:
    QuestRouteCompat() {
        ModName=L"Quest Navigation Fork Tracker Adapter"; ModVersion=L"1.12.0";
        ModDescription=L"Navigation-owned collectible bridge and settings UI compatibility";
        ModAuthors=L"kurosakana (fork); original navigation by azqwq333";
        register_on_lua_start(&lua_started);
    }
};
}
extern "C" __declspec(dllexport) RC::CppUserModBase* start_mod() {
    try {
        if (!supported_runtime()) { status("Unsupported UE4SS build; expected verified PBZ 1195 or 4.0.0 shipping. Adapter remains off."); return nullptr; }
        return new QuestRouteCompat();
    } catch (...) { status("Navigation adapter startup failed."); return nullptr; }
}
extern "C" __declspec(dllexport) void uninstall_mod(RC::CppUserModBase* mod) { delete mod; }
BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
    if (reason==DLL_PROCESS_ATTACH) { module_handle=instance; DisableThreadLibraryCalls(instance); }
    return TRUE;
}
